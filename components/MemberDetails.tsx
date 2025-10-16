import React from 'react';
import { Member } from '../types';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';

const StatusBadge: React.FC<{ status: 'pending' | 'complete' | 'installment' }> = ({ status }) => {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize';
  if (status === 'complete') {
    return <span className={`${baseClasses} bg-green-800 text-green-300`}>Complete</span>;
  }
  if (status === 'installment') {
    return <span className={`${baseClasses} bg-blue-800 text-blue-300`}>Installment</span>;
  }
  return <span className={`${baseClasses} bg-yellow-800 text-yellow-300`}>Pending</span>;
};

interface MemberDetailsProps {
  member: Member;
  onBack: () => void;
}

export const MemberDetails: React.FC<MemberDetailsProps> = ({ member, onBack }) => {
  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="inline-flex items-center mb-6 text-sm font-medium text-green-400 hover:text-green-300 transition-colors">
        <ArrowLeftIcon className="h-4 w-4 mr-2" />
        Back to Member List
      </button>

      <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-700">
            <div>
                <h2 className="text-2xl font-bold text-white">{member.full_name}</h2>
                <p className="text-sm text-gray-400">{member.email}</p>
            </div>
            <div className="mt-3 sm:mt-0">
                <StatusBadge status={member.payment_status} />
            </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <DetailItem label="Phone Number" value={member.phone} />
            <DetailItem label="Circle" value={member.circle} />
            <DetailItem label="Date Registered" value={new Date(member.date_registered).toLocaleDateString()} />
            <DetailItem label="Registration Fee" value={`$${member.registration_amount.toFixed(2)}`} />
            <DetailItem label="Membership Card ID" value={member.membership_card_id} isMono />
        </dl>

        <div className="mt-6 pt-4 border-t border-slate-700">
            <h3 className="text-sm font-medium text-gray-400 mb-2">AI-Generated Welcome Message</h3>
            <blockquote className="p-4 bg-slate-700 bg-opacity-50 border-l-4 border-green-500 rounded-r-lg italic text-gray-300">
                "{member.welcome_message}"
            </blockquote>
        </div>
      </div>
    </div>
  );
};

const DetailItem: React.FC<{label: string, value: string, isMono?: boolean}> = ({label, value, isMono = false}) => (
    <div className="py-2">
        <dt className="text-gray-400 font-medium">{label}</dt>
        <dd className={`mt-1 text-white ${isMono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
);
