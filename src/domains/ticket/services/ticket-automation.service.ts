/**
 * Ticket Automation Engine
 * ========================
 *
 * Event-driven rule evaluation engine that:
 * 1. Loads active automation rules per clinic (cached)
 * 2. Evaluates conditions against ticket state
 * 3. Executes matching actions (assign, set status/priority, add tags, etc.)
 * 4. Logs execution in TicketActivity
 *
 * @module domains/ticket/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { TicketAutomationRule, AutomationTrigger } from '@prisma/client';

type TriggerEvent = AutomationTrigger;

interface TicketContext {
  id: number;
  clinicId: number | null;
  status: string;
  priority: string;
  category: string;
  source: string;
  assignedToId: number | null;
  teamId: number | null;
  tags: string[];
  createdById: number;
  patientId: number | null;
  title: string;
  description: string;
}

interface AutomationCondition {
  field: string;
  operator: string;
  value: unknown;
}

interface AutomationAction {
  action: string;
  params: Record<string, unknown>;
}

const ruleCache = new Map<number, { rules: TicketAutomationRule[]; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

class TicketAutomationService {
  async evaluate(
    trigger: TriggerEvent,
    ticket: TicketContext,
    actorId: number
  ): Promise<void> {
    if (!ticket.clinicId) return;

    try {
      const rules = await this.getActiveRules(ticket.clinicId, trigger);
      if (rules.length === 0) return;

      for (const rule of rules) {
        try {
          const conditions = (rule.conditions as unknown as AutomationCondition[]) || [];
          const actions = (rule.actions as unknown as AutomationAction[]) || [];

          if (conditions.length === 0 || this.evaluateConditions(conditions, ticket)) {
            await this.executeActions(actions, ticket, rule.id, actorId);

            await prisma.ticketAutomationRule.update({
              where: { id: rule.id },
              data: {
                executionCount: { increment: 1 },
                lastExecutedAt: new Date(),
              },
            });

            logger.info('[Automation] Rule executed', {
              ruleId: rule.id,
              ruleName: rule.name,
              ticketId: ticket.id,
              trigger,
            });

            if (rule.stopOnMatch) break;
          }
        } catch (ruleError) {
          await prisma.ticketAutomationRule.update({
            where: { id: rule.id },
            data: { lastErrorAt: new Date(), lastError: String(ruleError) },
          }).catch(() => {});

          logger.error('[Automation] Rule execution failed', {
            ruleId: rule.id,
            ticketId: ticket.id,
            error: ruleError instanceof Error ? ruleError.message : String(ruleError),
          });
        }
      }
    } catch (error) {
      logger.error('[Automation] Engine error', {
        trigger,
        ticketId: ticket.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async getActiveRules(
    clinicId: number,
    trigger: TriggerEvent
  ): Promise<TicketAutomationRule[]> {
    const cached = ruleCache.get(clinicId);
    let allRules: TicketAutomationRule[];

    if (cached && cached.expiresAt > Date.now()) {
      allRules = cached.rules;
    } else {
      allRules = await prisma.ticketAutomationRule.findMany({
        where: { clinicId, isActive: true },
        orderBy: { priority: 'asc' },
      });
      ruleCache.set(clinicId, { rules: allRules, expiresAt: Date.now() + CACHE_TTL });
    }

    return allRules.filter((r) => r.trigger === trigger);
  }

  private evaluateConditions(conditions: AutomationCondition[], ticket: TicketContext): boolean {
    return conditions.every((condition) => this.evaluateCondition(condition, ticket));
  }

  private evaluateCondition(condition: AutomationCondition, ticket: TicketContext): boolean {
    const fieldValue = this.getFieldValue(ticket, condition.field);

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.toLowerCase().includes(String(condition.value).toLowerCase());
      case 'not_contains':
        return typeof fieldValue === 'string' && !fieldValue.toLowerCase().includes(String(condition.value).toLowerCase());
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
      case 'is_set':
        return fieldValue !== null && fieldValue !== undefined;
      case 'is_not_set':
        return fieldValue === null || fieldValue === undefined;
      default:
        return false;
    }
  }

  private getFieldValue(ticket: TicketContext, field: string): unknown {
    const fieldMap: Record<string, unknown> = {
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      source: ticket.source,
      assignedToId: ticket.assignedToId,
      teamId: ticket.teamId,
      tags: ticket.tags,
      createdById: ticket.createdById,
      patientId: ticket.patientId,
      title: ticket.title,
      description: ticket.description,
    };
    return fieldMap[field];
  }

  private async executeActions(
    actions: AutomationAction[],
    ticket: TicketContext,
    automationId: number,
    actorId: number
  ): Promise<void> {
    for (const action of actions) {
      switch (action.action) {
        case 'SET_PRIORITY':
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { priority: action.params.priority as string },
          });
          break;

        case 'SET_STATUS':
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: action.params.status as string },
          });
          break;

        case 'SET_CATEGORY':
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { category: action.params.category as string },
          });
          break;

        case 'ASSIGN_TO_USER':
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              assignedToId: action.params.userId as number,
              assignedAt: new Date(),
            },
          });
          break;

        case 'ASSIGN_TO_TEAM':
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { teamId: action.params.teamId as number },
          });
          break;

        case 'ADD_TAG': {
          const currentTags = ticket.tags || [];
          const newTag = action.params.tag as string;
          if (!currentTags.includes(newTag)) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: { tags: [...currentTags, newTag] },
            });
          }
          break;
        }

        case 'REMOVE_TAG': {
          const tags = ticket.tags || [];
          const tagToRemove = action.params.tag as string;
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { tags: tags.filter((t) => t !== tagToRemove) },
          });
          break;
        }

        case 'ADD_COMMENT':
          await prisma.ticketComment.create({
            data: {
              ticketId: ticket.id,
              authorId: actorId,
              comment: action.params.content as string,
              isInternal: (action.params.isInternal as boolean) ?? true,
            },
          });
          break;

        case 'ADD_INTERNAL_NOTE':
          await prisma.ticketComment.create({
            data: {
              ticketId: ticket.id,
              authorId: actorId,
              comment: action.params.content as string,
              isInternal: true,
            },
          });
          break;
      }

      await prisma.ticketActivity.create({
        data: {
          ticketId: ticket.id,
          userId: actorId,
          activityType: 'AUTOMATION_TRIGGERED',
          details: { automationId, action: action.action, params: action.params },
          automationId,
        },
      });
    }
  }

  clearCache(clinicId?: number) {
    if (clinicId) {
      ruleCache.delete(clinicId);
    } else {
      ruleCache.clear();
    }
  }
}

export const ticketAutomationService = new TicketAutomationService();
