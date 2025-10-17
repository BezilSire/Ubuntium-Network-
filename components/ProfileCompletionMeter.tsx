import React, { useMemo } from 'react';
import { User, Member } from '../types';
import { CheckCircleIcon } from './icons/CheckCircleIcon';

interface ProfileCompletionMeterProps {
  profileData: Partial<User & Member>;
  role: 'admin' | 'agent' | 'member';
}

export const ProfileCompletionMeter: React.FC<ProfileCompletionMeterProps> = ({ profileData, role }) => {
  const completionPercentage = useMemo(() => {
    let fieldsToCheck: (keyof (User & Member))[] = [];
    
    if (role === 'agent' || role === 'admin') {
      fieldsToCheck = ['phone', 'address', 'bio', 'id_card_number'];
    } else if (role === 'member') {
      fieldsToCheck = ['phone', 'address', 'bio', 'profession', 'skills', 'interests', 'passions', 'gender', 'age'];
    }

    if (fieldsToCheck.length === 0) return 0;

    const filledCount = fieldsToCheck.reduce((count, field) => {
      const value = profileData[field];
      return count + (value && String(value).trim() !== '' ? 1 : 0);
    }, 0);

    return Math.round((filledCount / fieldsToCheck.length) * 100);
  }, [profileData, role]);

  const barColor = completionPercentage === 100 ? 'bg-green-500' : 'bg-green-600';

  return (
    <div className="my-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-medium text-gray-200">Profile Completion</h4>
        <div className="flex items-center space-x-1">
            {completionPercentage === 100 && <CheckCircleIcon className="h-5 w-5 text-green-400" />}
            <span className="text-lg font-bold text-white">{completionPercentage}%</span>
        </div>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2.5">
        <div
          className={`${barColor} h-2.5 rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${completionPercentage}%` }}
        ></div>
      </div>
       {completionPercentage < 100 && (
          <p className="text-xs text-gray-400 mt-2">
              A complete profile helps build a stronger, more connected community.
          </p>
      )}
    </div>
  );
};
