import React from 'react';

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  npi: string;
  licenseNumber: string;
  licenseState: string;
  deaNumber: string;
  specialty: string;
  phone: string;
  address: string;
  acceptingNewPatients: boolean;
}

interface UserCreateModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
}

export default function UserCreateModal({ 
  show, 
  onClose, 
  onSubmit, 
  formData, 
  setFormData 
}: UserCreateModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-5 mx-auto p-5 border w-full max-w-3xl shadow-lg rounded-md bg-white">
        <div className="max-h-[85vh] overflow-y-auto">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Create New User
          </h3>
          
          <form onSubmit={onSubmit}>
            {/* Basic Information Section */}
            <div className="border-b pb-4 mb-4">
              <h4 className="text-md font-semibold mb-3">Basic Information</h4>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    value={formData.firstName}
                    onChange={(e: any) => setFormData({...formData, firstName: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    value={formData.lastName}
                    onChange={(e: any) => setFormData({...formData, lastName: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                  value={formData.email}
                  onChange={(e: any) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    value={formData.password}
                    onChange={(e: any) => setFormData({...formData, password: e.target.value})}
                    placeholder="Min 8 characters"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    value={formData.role}
                    onChange={(e: any) => setFormData({...formData, role: e.target.value})}
                  >
                    <option value="admin">Admin</option>
                    <option value="provider">Provider (Physician/Clinician)</option>
                    <option value="patient">Patient</option>
                    <option value="influencer">Influencer</option>
                    <option value="STAFF">Staff</option>
                    <option value="SUPPORT">Support</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Provider-Specific Fields */}
            {formData.role === "provider" && (
              <div className="border-b pb-4 mb-4">
                <h4 className="text-md font-semibold mb-3">Provider Information (Required for Providers)</h4>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      NPI Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required={formData.role === "provider"}
                      pattern="[0-9]{10}"
                      placeholder="10-digit NPI"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                      value={formData.npi}
                      onChange={(e: any) => setFormData({...formData, npi: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Medical License # <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required={formData.role === "provider"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                      value={formData.licenseNumber}
                      onChange={(e: any) => setFormData({...formData, licenseNumber: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      License State <span className="text-red-500">*</span>
                    </label>
                    <select
                      required={formData.role === "provider"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                      value={formData.licenseState}
                      onChange={(e: any) => setFormData({...formData, licenseState: e.target.value})}
                    >
                      <option value="">Select State</option>
                      <option value="AL">Alabama</option>
                      <option value="AK">Alaska</option>
                      <option value="AZ">Arizona</option>
                      <option value="AR">Arkansas</option>
                      <option value="CA">California</option>
                      <option value="CO">Colorado</option>
                      <option value="CT">Connecticut</option>
                      <option value="DE">Delaware</option>
                      <option value="FL">Florida</option>
                      <option value="GA">Georgia</option>
                      <option value="HI">Hawaii</option>
                      <option value="ID">Idaho</option>
                      <option value="IL">Illinois</option>
                      <option value="IN">Indiana</option>
                      <option value="IA">Iowa</option>
                      <option value="KS">Kansas</option>
                      <option value="KY">Kentucky</option>
                      <option value="LA">Louisiana</option>
                      <option value="ME">Maine</option>
                      <option value="MD">Maryland</option>
                      <option value="MA">Massachusetts</option>
                      <option value="MI">Michigan</option>
                      <option value="MN">Minnesota</option>
                      <option value="MS">Mississippi</option>
                      <option value="MO">Missouri</option>
                      <option value="MT">Montana</option>
                      <option value="NE">Nebraska</option>
                      <option value="NV">Nevada</option>
                      <option value="NH">New Hampshire</option>
                      <option value="NJ">New Jersey</option>
                      <option value="NM">New Mexico</option>
                      <option value="NY">New York</option>
                      <option value="NC">North Carolina</option>
                      <option value="ND">North Dakota</option>
                      <option value="OH">Ohio</option>
                      <option value="OK">Oklahoma</option>
                      <option value="OR">Oregon</option>
                      <option value="PA">Pennsylvania</option>
                      <option value="RI">Rhode Island</option>
                      <option value="SC">South Carolina</option>
                      <option value="SD">South Dakota</option>
                      <option value="TN">Tennessee</option>
                      <option value="TX">Texas</option>
                      <option value="UT">Utah</option>
                      <option value="VT">Vermont</option>
                      <option value="VA">Virginia</option>
                      <option value="WA">Washington</option>
                      <option value="WV">West Virginia</option>
                      <option value="WI">Wisconsin</option>
                      <option value="WY">Wyoming</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      DEA Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="For prescribing controlled substances"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                      value={formData.deaNumber}
                      onChange={(e: any) => setFormData({...formData, deaNumber: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Specialty <span className="text-red-500">*</span>
                    </label>
                    <select
                      required={formData.role === "provider"}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                      value={formData.specialty}
                      onChange={(e: any) => setFormData({...formData, specialty: e.target.value})}
                    >
                      <option value="">Select Specialty</option>
                      <option value="PRIMARY_CARE">Primary Care</option>
                      <option value="INTERNAL_MEDICINE">Internal Medicine</option>
                      <option value="FAMILY_MEDICINE">Family Medicine</option>
                      <option value="PEDIATRICS">Pediatrics</option>
                      <option value="OB_GYN">OB/GYN</option>
                      <option value="PSYCHIATRY">Psychiatry</option>
                      <option value="CARDIOLOGY">Cardiology</option>
                      <option value="DERMATOLOGY">Dermatology</option>
                      <option value="ENDOCRINOLOGY">Endocrinology</option>
                      <option value="GASTROENTEROLOGY">Gastroenterology</option>
                      <option value="NEUROLOGY">Neurology</option>
                      <option value="ONCOLOGY">Oncology</option>
                      <option value="ORTHOPEDICS">Orthopedics</option>
                      <option value="PULMONOLOGY">Pulmonology</option>
                      <option value="RHEUMATOLOGY">Rheumatology</option>
                      <option value="UROLOGY">Urology</option>
                      <option value="EMERGENCY_MEDICINE">Emergency Medicine</option>
                      <option value="ANESTHESIOLOGY">Anesthesiology</option>
                      <option value="RADIOLOGY">Radiology</option>
                      <option value="PATHOLOGY">Pathology</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required={formData.role === "provider"}
                      placeholder="(555) 123-4567"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                      value={formData.phone}
                      onChange={(e: any) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Practice Address
                  </label>
                  <input
                    type="text"
                    placeholder="Street Address, City, State ZIP"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    value={formData.address}
                    onChange={(e: any) => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="mr-2 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      checked={formData.acceptingNewPatients}
                      onChange={(e: any) => setFormData({...formData, acceptingNewPatients: e.target.checked})}
                    />
                    <span className="text-sm text-gray-700">Accepting New Patients</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end space-x-4">
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Create User
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
