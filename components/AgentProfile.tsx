import React, { useState } from 'react';
import { Agent, User } from '../types';
import { useToast } from '../contexts/ToastContext';

interface AgentProfileProps {
  agent: Agent;
  onUpdateUser: (updatedUser: Partial<User>) => Promise<void>;
}

export const AgentProfile: React.FC<AgentProfileProps> = ({ agent, onUpdateUser }) => {
  const [formData, setFormData] = useState({
    name: agent.name,
    email: agent.email,
    circle: agent.circle,
    phone: agent.phone || '',
    id_card_number: agent.id_card_number || '',
    address: agent.address || '',
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
    try {
      // Simple validation
      if (!formData.name.trim() || !formData.email.trim() || !formData.circle.trim()) {
        addToast('Name, email, and circle cannot be empty.', 'error');
        setIsLoading(false);
        return;
      }
      await onUpdateUser({ 
        name: formData.name, 
        email: formData.email, 
        circle: formData.circle,
        phone: formData.phone,
        id_card_number: formData.id_card_number,
        address: formData.address,
      });
      // The parent component handles success toast
    } catch (error) {
      addToast('Failed to update profile. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const hasChanges = formData.name !== agent.name || 
                     formData.email !== agent.email || 
                     formData.circle !== agent.circle ||
                     formData.phone !== (agent.phone || '') ||
                     formData.id_card_number !== (agent.id_card_number || '') ||
                     formData.address !== (agent.address || '');

  return (
    <div className="bg-slate-800 p-6 rounded-lg shadow-lg animate-fade-in max-w-2xl mx-auto">
      <h2 className="text-2xl font-semibold text-white mb-6 border-b border-slate-700 pb-4">Your Profile</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300">Full Name</label>
            <input
              type="text"
              name="name"
              id="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email Address</label>
            <input
              type="email"
              name="email"
              id="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-300">Phone Number</label>
              <input
                type="tel"
                name="phone"
                id="phone"
                placeholder="+256 772 123456"
                value={formData.phone}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="id_card_number" className="block text-sm font-medium text-gray-300">ID Card Number</label>
              <input
                type="text"
                name="id_card_number"
                id="id_card_number"
                placeholder="National ID or Passport"
                value={formData.id_card_number}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              />
            </div>
        </div>
        
        <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-300">Address</label>
            <textarea
              name="address"
              id="address"
              rows={3}
              value={formData.address}
              onChange={handleChange}
              placeholder="123 Ubuntu Lane, Kampala, Uganda"
              className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
            />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300">Agent Code</label>
            <p className="mt-1 text-gray-400 font-mono p-2 bg-slate-900 rounded-md">{agent.agent_code}</p>
          </div>
          <div>
            <label htmlFor="circle" className="block text-sm font-medium text-gray-300">Circle</label>
            <input
              type="text"
              name="circle"
              id="circle"
              value={formData.circle}
              onChange={handleChange}
              required
              className="mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-white focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isLoading || !hasChanges}
            className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-green-500 disabled:bg-slate-500 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};