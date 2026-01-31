'use client';

/**
 * Policy Management & Digital Signature Portal
 * 
 * SOC 2 Compliance: Executive policy approvals with digital signatures
 * 
 * This page allows authorized executives to:
 * - Review all organizational policies
 * - Digitally sign policies (legally binding)
 * - Track employee acknowledgments
 * - Export compliance evidence
 */

import React, { useState, useEffect, useCallback } from 'react';

interface PolicyApproval {
  type: string;
  approvedBy: string;
  approvedAt: string;
}

interface AcknowledgmentStats {
  total: number;
  acknowledged: number;
  pending: number;
}

interface Policy {
  id: number;
  policyId: string;
  title: string;
  version: string;
  status: string;
  effectiveDate: string;
  requiredApprovals: string[];
  approvals: PolicyApproval[];
  isFullyApproved: boolean;
  acknowledgmentStats?: AcknowledgmentStats;
}

interface SignatureModalProps {
  policy: Policy;
  signatureType: 'executive_approval' | 'ciso_approval';
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function SignatureModal({ policy, signatureType, onConfirm, onCancel, isSubmitting }: SignatureModalProps) {
  const [agreed, setAgreed] = useState(false);
  
  const signatureStatements: Record<string, string> = {
    executive_approval: `I, as an authorized executive of this organization, hereby approve and adopt "${policy.title}" (Version ${policy.version}) as official company policy. I confirm that I have reviewed this policy and authorize its implementation effective immediately.`,
    ciso_approval: `I, as the Chief Information Security Officer, certify that "${policy.title}" (Version ${policy.version}) meets our security and compliance requirements. I approve this policy for implementation.`,
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl">
          <h2 className="text-xl font-bold text-white">Digital Policy Signature</h2>
          <p className="text-blue-100 text-sm">SOC 2 Compliant Electronic Approval</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Policy Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Policy ID:</span>
                <span className="ml-2 font-medium">{policy.policyId}</span>
              </div>
              <div>
                <span className="text-gray-500">Version:</span>
                <span className="ml-2 font-medium">{policy.version}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">Title:</span>
                <span className="ml-2 font-medium">{policy.title}</span>
              </div>
            </div>
          </div>

          {/* Signature Type Badge */}
          <div className="mb-6">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              signatureType === 'executive_approval' 
                ? 'bg-purple-100 text-purple-800' 
                : 'bg-green-100 text-green-800'
            }`}>
              {signatureType === 'executive_approval' ? '👔 Executive Approval' : '🛡️ CISO Approval'}
            </span>
          </div>

          {/* Legal Statement */}
          <div className="border-2 border-blue-200 rounded-lg p-4 mb-6 bg-blue-50">
            <h3 className="font-semibold text-gray-900 mb-2">Signature Statement</h3>
            <p className="text-gray-700 text-sm leading-relaxed">
              {signatureStatements[signatureType]}
            </p>
          </div>

          {/* What Gets Recorded */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-amber-800 mb-2 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              This signature will record:
            </h3>
            <ul className="text-sm text-amber-700 space-y-1 ml-7">
              <li>• Your identity (name, email, role)</li>
              <li>• Timestamp of signature</li>
              <li>• Your IP address</li>
              <li>• Policy content hash (tamper detection)</li>
              <li>• Legal statement above</li>
            </ul>
          </div>

          {/* Agreement Checkbox */}
          <label className="flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              I have read and reviewed the complete policy document. I understand this creates a 
              legally binding digital signature that will be used as evidence for SOC 2 compliance.
            </span>
          </label>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!agreed || isSubmitting}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Sign Policy
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingPolicy, setSigningPolicy] = useState<Policy | null>(null);
  const [signatureType, setSignatureType] = useState<'executive_approval' | 'ciso_approval'>('executive_approval');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/policies');
      if (!response.ok) throw new Error('Failed to fetch policies');
      const data = await response.json();
      setPolicies(data.policies || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const handleOpenSignature = (policy: Policy, type: 'executive_approval' | 'ciso_approval') => {
    setSigningPolicy(policy);
    setSignatureType(type);
  };

  const handleConfirmSignature = async () => {
    if (!signingPolicy) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          policyId: signingPolicy.id, 
          approvalType: signatureType 
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sign policy');
      }

      setSuccessMessage(`Successfully signed ${signingPolicy.policyId} as ${signatureType.replace('_', ' ')}`);
      setSigningPolicy(null);
      fetchPolicies();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (policy: Policy) => {
    if (policy.isFullyApproved) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Active
        </span>
      );
    }
    if (policy.approvals.length > 0) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          Pending ({policy.approvals.length}/2)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clipRule="evenodd" />
        </svg>
        Draft
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading policies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-red-800 font-semibold mb-2">Error Loading Policies</h2>
          <p className="text-red-700">{error}</p>
          <button 
            onClick={fetchPolicies}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const pendingPolicies = policies.filter(p => !p.isFullyApproved);
  const activePolicies = policies.filter(p => p.isFullyApproved);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-slide-in">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {successMessage}
        </div>
      )}

      {/* Signature Modal */}
      {signingPolicy && (
        <SignatureModal
          policy={signingPolicy}
          signatureType={signatureType}
          onConfirm={handleConfirmSignature}
          onCancel={() => setSigningPolicy(null)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Policy Approval Center</h1>
              <p className="text-gray-500 mt-1">SOC 2 Compliance • Digital Signatures</p>
            </div>
            <div className="flex items-center gap-4">
              <a 
                href="/api/admin/policies?format=report"
                target="_blank"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Compliance Report
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Policies</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{policies.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Fully Approved</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{activePolicies.length}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Awaiting Signature</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{pendingPolicies.length}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Compliance Status</p>
                <p className="text-3xl font-bold mt-1">
                  {pendingPolicies.length === 0 ? (
                    <span className="text-green-600">Ready</span>
                  ) : (
                    <span className="text-amber-600">Pending</span>
                  )}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                pendingPolicies.length === 0 ? 'bg-green-100' : 'bg-amber-100'
              }`}>
                <svg className={`w-6 h-6 ${pendingPolicies.length === 0 ? 'text-green-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Signatures Alert */}
        {pendingPolicies.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-amber-800">Action Required: {pendingPolicies.length} Policies Awaiting Signature</h3>
                <p className="text-amber-700 mt-1">
                  To complete SOC 2 compliance, all policies require both Executive and CISO approval. 
                  Please review and sign each policy below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Policies Grid */}
        <div className="space-y-6">
          {policies.map((policy) => (
            <div 
              key={policy.policyId} 
              className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                policy.isFullyApproved ? 'border-green-200' : 'border-gray-200'
              }`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {policy.policyId}
                      </span>
                      {getStatusBadge(policy)}
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">{policy.title}</h3>
                    <p className="text-gray-500 mt-1">Version {policy.version}</p>
                  </div>
                  <a 
                    href={`/docs/policies/${policy.policyId}-${policy.title.replace(/\s+/g, '-').toUpperCase().substring(0, 30)}.md`}
                    target="_blank"
                    className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    View Document
                  </a>
                </div>

                {/* Approval Status Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {/* Executive Approval */}
                  <div className={`rounded-lg p-4 ${
                    policy.approvals.find(a => a.type === 'executive_approval')
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">👔</span>
                          <span className="font-medium text-gray-900">Executive Approval</span>
                        </div>
                        {policy.approvals.find(a => a.type === 'executive_approval') ? (
                          <div className="mt-2 text-sm">
                            <p className="text-green-700 font-medium">
                              ✓ Signed by {policy.approvals.find(a => a.type === 'executive_approval')?.approvedBy}
                            </p>
                            <p className="text-green-600">
                              {new Date(policy.approvals.find(a => a.type === 'executive_approval')?.approvedAt || '').toLocaleString()}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-gray-500">Awaiting signature</p>
                        )}
                      </div>
                      {!policy.approvals.find(a => a.type === 'executive_approval') && (
                        <button
                          onClick={() => handleOpenSignature(policy, 'executive_approval')}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm"
                        >
                          Sign as CEO
                        </button>
                      )}
                    </div>
                  </div>

                  {/* CISO Approval */}
                  <div className={`rounded-lg p-4 ${
                    policy.approvals.find(a => a.type === 'ciso_approval')
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🛡️</span>
                          <span className="font-medium text-gray-900">CISO Approval</span>
                        </div>
                        {policy.approvals.find(a => a.type === 'ciso_approval') ? (
                          <div className="mt-2 text-sm">
                            <p className="text-green-700 font-medium">
                              ✓ Signed by {policy.approvals.find(a => a.type === 'ciso_approval')?.approvedBy}
                            </p>
                            <p className="text-green-600">
                              {new Date(policy.approvals.find(a => a.type === 'ciso_approval')?.approvedAt || '').toLocaleString()}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-gray-500">Awaiting signature</p>
                        )}
                      </div>
                      {!policy.approvals.find(a => a.type === 'ciso_approval') && (
                        <button
                          onClick={() => handleOpenSignature(policy, 'ciso_approval')}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
                        >
                          Sign as CISO
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Export Certificate Button */}
                {policy.approvals.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <a 
                      href={`/api/admin/policies?format=certificate&policyId=${policy.policyId}`}
                      target="_blank"
                      className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export Approval Certificate
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 rounded-xl p-6 border border-blue-100">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            About Digital Signatures
          </h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              Digital signatures are legally binding electronic approvals that meet SOC 2 requirements
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              Each signature captures your identity, timestamp, IP address, and a cryptographic hash of the policy content
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              All signatures are logged to the HIPAA audit trail for compliance evidence
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">•</span>
              Policies require both Executive (CEO) and CISO approval to become &quot;Active&quot;
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
