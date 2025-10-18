import React, { useState } from 'react';
import { User } from '../types';
import { useToast } from '../contexts/ToastContext';
import { ProfileCompletionMeter } from './ProfileCompletionMeter';

interface CompleteProfilePageProps {
  user: User;
  onProfileComplete: (updatedData: Partial<User>) => Promise<void>;
}

export const CompleteProfilePage: React.FC<CompleteProfilePageProps> = ({ user, onProfileComplete }) => {
  const [formData, setFormData] = useState({
    phone: user.phone || '',
    address: user.address || '',
    bio: user.bio || '',
    // Member-specific fields
    profession: '',
    skills: '',
    interests: '',
    passions: '',
    gender: '',
    age: '',
    // Agent-specific
    id_card_number: user.id_card_number || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const requiredFields = user.role === 'member'
      ? ['phone', 'address', 'bio', 'profession']
      : ['phone', 'address', 'bio', 'id_card_number'];

    const isMissingFields = requiredFields.some(field => !(formData as any)[field]?.trim());

    if (isMissingFields) {
      addToast('Please fill in all required fields to continue.', 'error');
      setIsLoading(false);
      return;
    }

    try {
      await onProfileComplete(formData);
      // On success, the App component will automatically navigate away.
    } catch (error) {
      addToast('Failed to update profile. Please try again.', 'error');
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
        <div className="bg-slate-800 p-6 rounded-lg shadow-lg animate-fade-in">
            <h2 className="text-2xl font-bold text-white">Complete Your Profile</h2>
            <p className="text-gray-400 mt-1 mb-6">Welcome to the community! Please provide some additional information to activate your account.</p>

            <ProfileCompletionMeter profileData={{ ...user, ...formData }} role={user.role} />

            <form onSubmit={handleSubmit} className="space-y-6">
                {user.role === 'member' && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-300">Phone Number <span className="text-red-400">*</span></label>
                                <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white" />
                            </div>
                            <div>
                                <label htmlFor="profession" className="block text-sm font-medium text-gray-300">Profession <span className="text-red-400">*</span></label>
                                <input type="text" name="profession" id="profession" value={formData.profession} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white" />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="address" className="block text-sm font-medium text-gray-300">Address <span className="text-red-400">*</span></label>
                            <input type="text" name="address" id="address" value={formData.address} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white" />
                        </div>
                        <div>
                            <label htmlFor="bio" className="block text-sm font-medium text-gray-300">Bio <span className="text-red-400">*</span></label>
                            <textarea name="bio" id="bio" rows={4} value={formData.bio} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white" />
                        </div>
                    </>
                )}

                 { (user.role === 'agent' || user.role === 'admin') && (
                     <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-300">Phone Number <span className="text-red-400">*</span></label>
                                <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white" />
                            </div>
                            <div>
                                <label htmlFor="id_card_number" className="block text-sm font-medium text-gray-300">ID Card Number <span className="text-red-400">*</span></label>
                                <input type="text" name="id_card_number" id="id_card_number" value={formData.id_card_number} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white" />
                            </div>
                        </div>
                         <div>
                            <label htmlFor="address" className="block text-sm font-medium text-gray-300">Address <span className="text-red-400">*</span></label>
                            <textarea name="address" id="address" rows={3} value={formData.address} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white" />
                        </div>
                        <div>
                            <label htmlFor="bio" className="block text-sm font-medium text-gray-300">Bio <span className="text-red-400">*</span></label>
                            <textarea name="bio" id="bio" rows={4} value={formData.bio} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white" />
                        </div>
                     </>
                 )}

                <div className="flex justify-end pt-4 border-t border-slate-700">
                    <button type="submit" disabled={isLoading} className="inline-flex justify-center py-2 px-6 border border-transparent rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-slate-500">
                        {isLoading ? 'Saving...' : 'Save and Continue'}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};
