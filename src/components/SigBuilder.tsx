"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getEnhancedTemplates,
  getDefaultStorage,
  getDefaultAdministration,
  buildComprehensiveSig,
  getMedicationCategory,
  type EnhancedSigTemplate,
  type StorageInfo,
  type AdministrationInfo,
  type WarningsInfo,
} from "@/lib/medications-enhanced";
import { MEDS } from "@/lib/medications";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

interface SigBuilderProps {
  medicationKey: string;
  initialSig?: string;
  initialQuantity?: string;
  initialRefills?: string;
  onSigChange: (sig: string) => void;
  onQuantityChange?: (quantity: string) => void;
  onRefillsChange?: (refills: string) => void;
  disabled?: boolean;
}

interface SigOptions {
  includeStorage: boolean;
  includeAdministration: boolean;
  includeWarnings: boolean;
  includeMissedDose: boolean;
}

// ============================================================================
// ICONS
// ============================================================================

const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" />
  </svg>
);

const ChevronDownIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

const ChevronUpIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const InfoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
  </svg>
);

const SnowflakeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="2" x2="12" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
    <line x1="19.07" y1="4.93" x2="4.93" y2="19.07"></line>
  </svg>
);

const SyringeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19.5 4.5L4.5 19.5M12 3l9 9-9 9m0-9h9M9 12l-6 6"></path>
  </svg>
);

const AlertIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);

// ============================================================================
// COMPONENT
// ============================================================================

export default function SigBuilder({
  medicationKey,
  initialSig = "",
  initialQuantity = "",
  initialRefills = "",
  onSigChange,
  onQuantityChange,
  onRefillsChange,
  disabled = false,
}: SigBuilderProps) {
  // State
  const [sig, setSig] = useState(initialSig);
  const [selectedTemplate, setSelectedTemplate] = useState<EnhancedSigTemplate | null>(null);
  const [templates, setTemplates] = useState<EnhancedSigTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Options for sig building
  const [options, setOptions] = useState<SigOptions>({
    includeStorage: true,
    includeAdministration: false,
    includeWarnings: false,
    includeMissedDose: false,
  });
  
  // Get medication info
  const med = MEDS[medicationKey];
  const category = medicationKey ? getMedicationCategory(medicationKey) : null;
  
  // Load templates when medication changes
  useEffect(() => {
    if (!medicationKey) {
      setTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    
    const enhanced = getEnhancedTemplates(medicationKey);
    if (enhanced && enhanced.length > 0) {
      setTemplates(enhanced);
      // If no initial sig, select first template
      if (!initialSig && enhanced.length > 0) {
        handleSelectTemplate(enhanced[0]);
      }
    } else {
      setTemplates([]);
      // Set default storage/admin based on form
      if (med) {
        const storage = getDefaultStorage(med.form);
        const admin = getDefaultAdministration(med.form);
        setSelectedTemplate({
          label: "Custom",
          sig: initialSig || `Use ${med.name} as directed.`,
          quantity: initialQuantity || "1",
          refills: initialRefills || "0",
          storage,
          administration: admin,
        });
      }
    }
  }, [medicationKey]);
  
  // Handle template selection
  const handleSelectTemplate = useCallback((template: EnhancedSigTemplate) => {
    setSelectedTemplate(template);
    
    // Build sig with current options
    const fullSig = buildComprehensiveSig(template, options);
    setSig(fullSig);
    onSigChange(fullSig);
    
    // Update quantity and refills if handlers provided
    if (onQuantityChange) onQuantityChange(template.quantity);
    if (onRefillsChange) onRefillsChange(template.refills);
  }, [options, onSigChange, onQuantityChange, onRefillsChange]);
  
  // Update sig when options change
  useEffect(() => {
    if (selectedTemplate) {
      const fullSig = buildComprehensiveSig(selectedTemplate, options);
      setSig(fullSig);
      onSigChange(fullSig);
    }
  }, [options, selectedTemplate]);
  
  // Handle manual sig edit
  const handleSigEdit = (value: string) => {
    setSig(value);
    onSigChange(value);
    // Clear selected template since user is customizing
    if (selectedTemplate && value !== buildComprehensiveSig(selectedTemplate, options)) {
      setSelectedTemplate({ ...selectedTemplate, sig: value });
    }
  };
  
  // AI Generation
  const handleAiGenerate = async () => {
    if (!medicationKey || !med) return;
    
    setIsAiGenerating(true);
    setError(null);
    
    try {
      const token = localStorage.getItem("token") ||
                    localStorage.getItem("auth-token") ||
                    localStorage.getItem("provider-token") ||
                    localStorage.getItem("admin-token");
      
      const response = await fetch("/api/ai/generate-sig", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          medicationKey,
          medicationName: med.name,
          form: med.form,
          strength: med.strength,
          options: {
            includeStorage: options.includeStorage,
            includeAdministration: options.includeAdministration,
            includeWarnings: options.includeWarnings,
            includeMissedDose: options.includeMissedDose,
            style: "comprehensive",
          },
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate sig");
      }
      
      const data = await response.json();
      
      if (data.success && data.sig) {
        setSelectedTemplate(data.sig);
        const fullSig = data.sig.sig || buildComprehensiveSig(data.sig, options);
        setSig(fullSig);
        onSigChange(fullSig);
        
        if (onQuantityChange && data.sig.quantity) {
          onQuantityChange(data.sig.quantity);
        }
        if (onRefillsChange && data.sig.refills) {
          onRefillsChange(data.sig.refills);
        }
      }
    } catch (err: any) {
      logger.error("[SigBuilder] AI generation failed", { error: err.message });
      setError(err.message || "Failed to generate sig");
    } finally {
      setIsAiGenerating(false);
    }
  };
  
  // Toggle option
  const toggleOption = (key: keyof SigOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  // Render section details
  const renderSectionDetails = (section: string) => {
    if (!selectedTemplate) return null;
    
    switch (section) {
      case "storage":
        const storage = selectedTemplate.storage;
        if (!storage) return <p className="text-sm text-gray-500">No storage information available.</p>;
        return (
          <div className="space-y-2 text-sm">
            <p className="text-gray-700">{storage.text}</p>
            {storage.temperature && (
              <div className="flex items-center gap-2 text-gray-600">
                <SnowflakeIcon />
                <span className="capitalize">{storage.temperature.replace("-", " ")}</span>
                {storage.temperatureRange && <span className="text-gray-500">({storage.temperatureRange})</span>}
              </div>
            )}
            {storage.lightSensitive && (
              <p className="text-amber-600 flex items-center gap-1">
                <AlertIcon />
                Light sensitive - protect from direct light
              </p>
            )}
            {storage.specialInstructions && (
              <p className="text-gray-600 italic">{storage.specialInstructions}</p>
            )}
          </div>
        );
        
      case "administration":
        const admin = selectedTemplate.administration;
        if (!admin) return <p className="text-sm text-gray-500">No administration details available.</p>;
        return (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <SyringeIcon />
              {admin.route}
            </div>
            {admin.timing && (
              <p className="text-gray-600"><strong>When:</strong> {admin.timing}</p>
            )}
            {admin.sites && admin.sites.length > 0 && (
              <div>
                <p className="text-gray-600 font-medium mb-1">Injection Sites:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  {admin.sites.map((site, i) => (
                    <li key={i}>{site}</li>
                  ))}
                </ul>
              </div>
            )}
            {admin.foodInteraction && (
              <p className="text-gray-600"><strong>Food:</strong> {admin.foodInteraction}</p>
            )}
            {admin.preparationSteps && admin.preparationSteps.length > 0 && (
              <div>
                <p className="text-gray-600 font-medium mb-1">Preparation:</p>
                <ol className="list-decimal list-inside text-gray-600 space-y-1">
                  {admin.preparationSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        );
        
      case "warnings":
        const warnings = selectedTemplate.warnings;
        if (!warnings) return <p className="text-sm text-gray-500">No warnings information available.</p>;
        return (
          <div className="space-y-3 text-sm">
            {warnings.commonSideEffects && warnings.commonSideEffects.length > 0 && (
              <div>
                <p className="text-gray-700 font-medium mb-1">Common Side Effects:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  {warnings.commonSideEffects.map((effect, i) => (
                    <li key={i}>{effect}</li>
                  ))}
                </ul>
              </div>
            )}
            {warnings.seriousSideEffects && warnings.seriousSideEffects.length > 0 && (
              <div>
                <p className="text-amber-700 font-medium mb-1 flex items-center gap-1">
                  <AlertIcon /> Serious - Seek Medical Attention:
                </p>
                <ul className="list-disc list-inside text-amber-600 space-y-1">
                  {warnings.seriousSideEffects.map((effect, i) => (
                    <li key={i}>{effect}</li>
                  ))}
                </ul>
              </div>
            )}
            {warnings.contraindications && warnings.contraindications.length > 0 && (
              <div>
                <p className="text-red-700 font-medium mb-1">Contraindications:</p>
                <ul className="list-disc list-inside text-red-600 space-y-1">
                  {warnings.contraindications.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {warnings.monitoring && warnings.monitoring.length > 0 && (
              <div>
                <p className="text-blue-700 font-medium mb-1">Monitor:</p>
                <ul className="list-disc list-inside text-blue-600 space-y-1">
                  {warnings.monitoring.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
        
      case "missedDose":
        if (!selectedTemplate.missedDose) {
          return <p className="text-sm text-gray-500">No missed dose guidance available.</p>;
        }
        return (
          <p className="text-sm text-gray-700">{selectedTemplate.missedDose}</p>
        );
        
      default:
        return null;
    }
  };
  
  if (!medicationKey) {
    return (
      <div className="text-sm text-gray-500 italic p-3 bg-gray-50 rounded-lg">
        Select a medication to configure directions.
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header with AI Generate Button */}
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Sig (Directions) *
          </label>
          {category && (
            <span className="text-xs text-gray-500">{category} Medication</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleAiGenerate}
          disabled={disabled || isAiGenerating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isAiGenerating ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating...
            </>
          ) : (
            <>
              <SparklesIcon />
              AI Generate
            </>
          )}
        </button>
      </div>
      
      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      
      {/* Template Selector */}
      {templates.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Dosing Templates
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map((template) => {
              const isSelected = selectedTemplate?.label === template.label;
              return (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => handleSelectTemplate(template)}
                  disabled={disabled}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                    isSelected
                      ? "border-[#17aa7b] bg-[#e9f7f2] ring-1 ring-[#17aa7b]"
                      : "border-gray-200 bg-white hover:border-[#17aa7b] hover:bg-[#f6fefb]"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-gray-900">{template.label}</span>
                    {isSelected && (
                      <span className="text-[#17aa7b]"><CheckIcon /></span>
                    )}
                  </div>
                  {template.phase && (
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                      template.phase === "initiation" ? "bg-blue-100 text-blue-700" :
                      template.phase === "escalation" ? "bg-amber-100 text-amber-700" :
                      template.phase === "maintenance" ? "bg-green-100 text-green-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {template.phase}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Options Toggles */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggleOption("includeStorage")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
            options.includeStorage
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          <SnowflakeIcon />
          Storage
          {options.includeStorage && <CheckIcon />}
        </button>
        <button
          type="button"
          onClick={() => toggleOption("includeAdministration")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
            options.includeAdministration
              ? "bg-green-50 border-green-300 text-green-700"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          <SyringeIcon />
          Administration
          {options.includeAdministration && <CheckIcon />}
        </button>
        <button
          type="button"
          onClick={() => toggleOption("includeWarnings")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
            options.includeWarnings
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          <AlertIcon />
          Warnings
          {options.includeWarnings && <CheckIcon />}
        </button>
        <button
          type="button"
          onClick={() => toggleOption("includeMissedDose")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
            options.includeMissedDose
              ? "bg-purple-50 border-purple-300 text-purple-700"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          <InfoIcon />
          Missed Dose
          {options.includeMissedDose && <CheckIcon />}
        </button>
      </div>
      
      {/* Sig Text Area */}
      <textarea
        value={sig}
        onChange={(e) => handleSigEdit(e.target.value)}
        disabled={disabled}
        rows={4}
        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#17aa7b] focus:border-[#17aa7b] disabled:bg-gray-100"
        placeholder="Enter prescription directions..."
      />
      
      {/* Expandable Detail Sections */}
      {selectedTemplate && (
        <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-200">
          {/* Storage Section */}
          {selectedTemplate.storage && (
            <div>
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === "storage" ? null : "storage")}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <SnowflakeIcon />
                  Storage Requirements
                </span>
                {expandedSection === "storage" ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </button>
              {expandedSection === "storage" && (
                <div className="px-4 py-3 bg-white">
                  {renderSectionDetails("storage")}
                </div>
              )}
            </div>
          )}
          
          {/* Administration Section */}
          {selectedTemplate.administration && (
            <div>
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === "administration" ? null : "administration")}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <SyringeIcon />
                  Administration Details
                </span>
                {expandedSection === "administration" ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </button>
              {expandedSection === "administration" && (
                <div className="px-4 py-3 bg-white">
                  {renderSectionDetails("administration")}
                </div>
              )}
            </div>
          )}
          
          {/* Warnings Section */}
          {selectedTemplate.warnings && (
            <div>
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === "warnings" ? null : "warnings")}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-amber-700">
                  <AlertIcon />
                  Warnings & Side Effects
                </span>
                {expandedSection === "warnings" ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </button>
              {expandedSection === "warnings" && (
                <div className="px-4 py-3 bg-white">
                  {renderSectionDetails("warnings")}
                </div>
              )}
            </div>
          )}
          
          {/* Missed Dose Section */}
          {selectedTemplate.missedDose && (
            <div>
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === "missedDose" ? null : "missedDose")}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <InfoIcon />
                  Missed Dose Guidance
                </span>
                {expandedSection === "missedDose" ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </button>
              {expandedSection === "missedDose" && (
                <div className="px-4 py-3 bg-white">
                  {renderSectionDetails("missedDose")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Help Text */}
      <p className="text-xs text-gray-500">
        Toggle options above to include additional information in the sig. Use AI Generate for comprehensive directions based on patient context.
      </p>
    </div>
  );
}
