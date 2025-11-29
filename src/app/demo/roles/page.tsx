'use client';

import { useState } from 'react';
import { ROLE_CONFIGS, hasFeatureAccess } from '@/lib/auth/roles.config';
import { 
  Shield, Users, Activity, Headphones, UserCheck, Star, Heart,
  Check, X, AlertCircle, ChevronRight, Eye, EyeOff
} from 'lucide-react';

const roleIcons: Record<string, any> = {
  super_admin: Shield,
  admin: Users,
  provider: Activity,
  staff: UserCheck,
  support: Headphones,
  patient: Heart,
  influencer: Star
};

export default function RoleDemoPage() {
  const [selectedRole, setSelectedRole] = useState<string>('admin');
  const [showFeatures, setShowFeatures] = useState(true);
  const [showNavigation, setShowNavigation] = useState(true);
  const [showTheme, setShowTheme] = useState(true);

  const currentConfig = ROLE_CONFIGS[selectedRole as keyof typeof ROLE_CONFIGS];
  const RoleIcon = roleIcons[selectedRole] || Users;

  const allFeatures = Object.keys(ROLE_CONFIGS.super_admin.features);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Role-Based Access Control Demo</h1>
          <p className="text-gray-600">Explore the different layouts, features, and permissions for each user role</p>
        </div>

        {/* Role Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select a Role</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {Object.entries(ROLE_CONFIGS).map(([role, config]) => {
              const Icon = roleIcons[role] || Users;
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedRole === role
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`p-3 rounded-lg mx-auto w-fit mb-2 bg-gradient-to-r ${config.theme.bgGradient}`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <p className={`text-sm font-medium ${
                    selectedRole === role ? 'text-blue-700' : 'text-gray-900'
                  }`}>
                    {config.displayName}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {role.replace('_', ' ').toUpperCase()}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Role Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Role Overview */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className={`p-4 rounded-lg bg-gradient-to-r ${currentConfig.theme.bgGradient} text-white mb-4`}>
                <RoleIcon className="h-8 w-8 mb-2" />
                <h3 className="text-xl font-bold">{currentConfig.displayName}</h3>
                <p className="text-sm opacity-90 mt-1">{currentConfig.description}</p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Default Path</p>
                  <p className="text-sm font-medium text-gray-900 font-mono">{currentConfig.defaultPath}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500 mb-2">Theme Colors</p>
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-8 h-8 rounded-lg border border-gray-300"
                      style={{ backgroundColor: currentConfig.theme.primaryColor }}
                      title="Primary"
                    />
                    <div 
                      className="w-8 h-8 rounded-lg border border-gray-300"
                      style={{ backgroundColor: currentConfig.theme.secondaryColor }}
                      title="Secondary"
                    />
                    <div 
                      className="w-8 h-8 rounded-lg border border-gray-300"
                      style={{ backgroundColor: currentConfig.theme.iconColor }}
                      title="Icon"
                    />
                  </div>
                </div>

                {/* Quick Actions */}
                {currentConfig.navigation.quick && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Quick Actions</p>
                    <div className="space-y-2">
                      {currentConfig.navigation.quick.map((action) => (
                        <div 
                          key={action.action}
                          className={`px-3 py-2 rounded-lg text-sm font-medium text-white
                            ${action.color === 'green' ? 'bg-green-600' : ''}
                            ${action.color === 'blue' ? 'bg-blue-600' : ''}
                            ${action.color === 'purple' ? 'bg-purple-600' : ''}
                            ${action.color === 'red' ? 'bg-red-600' : ''}
                            ${action.color === 'orange' ? 'bg-orange-600' : ''}
                          `}
                        >
                          {action.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Navigation Items</h3>
                <button 
                  onClick={() => setShowNavigation(!showNavigation)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  {showNavigation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              
              {showNavigation && (
                <div className="space-y-1">
                  {currentConfig.navigation.primary.map((item) => (
                    <div key={item.path}>
                      <div className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">
                        <ChevronRight className="h-4 w-4 mr-2 text-gray-400" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                      {item.subItems && (
                        <div className="ml-6 space-y-1">
                          {item.subItems.map((subItem) => (
                            <div key={subItem.path} className="flex items-center px-3 py-1 text-xs text-gray-600">
                              <ChevronRight className="h-3 w-3 mr-2 text-gray-400" />
                              {subItem.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Features Matrix */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Feature Access Matrix</h3>
                <button 
                  onClick={() => setShowFeatures(!showFeatures)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  {showFeatures ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {showFeatures && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Patient Management */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Patient Management</h4>
                    <div className="space-y-2">
                      {['viewAllPatients', 'editPatients', 'deletePatients', 'viewPatientPHI', 'exportPatientData'].map((feature) => (
                        <div key={feature} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-700">
                            {feature.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          {currentConfig.features[feature as keyof typeof currentConfig.features] ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Clinical Features */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Clinical Features</h4>
                    <div className="space-y-2">
                      {['createSoapNotes', 'prescribeRx', 'orderLabs', 'viewMedicalRecords', 'uploadDocuments'].map((feature) => (
                        <div key={feature} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-700">
                            {feature.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          {currentConfig.features[feature as keyof typeof currentConfig.features] ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Administrative */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Administrative</h4>
                    <div className="space-y-2">
                      {['manageUsers', 'manageClinics', 'viewAnalytics', 'viewFinancials', 'manageSubscriptions'].map((feature) => (
                        <div key={feature} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-700">
                            {feature.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          {currentConfig.features[feature as keyof typeof currentConfig.features] ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Communication & System */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Communication & System</h4>
                    <div className="space-y-2">
                      {['internalMessaging', 'patientMessaging', 'ticketManagement', 'systemSettings', 'auditLogs'].map((feature) => (
                        <div key={feature} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-700">
                            {feature.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          {currentConfig.features[feature as keyof typeof currentConfig.features] ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Restrictions */}
            {currentConfig.restrictions && currentConfig.restrictions.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Restrictions</h3>
                <div className="space-y-2">
                  {currentConfig.restrictions.map((restriction, index) => (
                    <div key={index} className="flex items-start">
                      <AlertCircle className="h-4 w-4 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-700">{restriction}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
