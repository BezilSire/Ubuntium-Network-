import React from 'react';
import { Activity } from '../types';
import { formatTimeAgo } from '../utils';
import { UsersIcon } from './icons/UsersIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { UserCircleIcon } from './icons/UserCircleIcon';

interface ActivityItemProps {
  activity: Activity;
  onViewProfile: (userId: string) => void;
}

const ActivityIcon: React.FC<{ type: Activity['type'] }> = ({ type }) => {
    const className = "h-8 w-8 text-green-400";
    switch (type) {
        case 'NEW_MEMBER': return <UsersIcon className={className} />;
        case 'NEW_POST_PROPOSAL': return <LightbulbIcon className={className} />;
        case 'NEW_POST_OPPORTUNITY': return <BriefcaseIcon className={className} />;
        case 'NEW_POST_OFFER': return <UsersIcon className={className} />;
        case 'NEW_POST_GENERAL': return <MessageSquareIcon className={className} />;
        default: return <UserCircleIcon className={className} />;
    }
};


export const ActivityItem: React.FC<ActivityItemProps> = ({ activity, onViewProfile }) => {
  return (
    <div className="bg-slate-800/50 p-4 rounded-lg flex items-center space-x-4 border border-slate-700/50">
      <div className="flex-shrink-0 bg-slate-700 rounded-full p-3">
         <ActivityIcon type={activity.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300">
            {activity.message.includes(activity.causerName) ? (
                <>
                    <button onClick={() => onViewProfile(activity.causerId)} className="font-semibold text-white hover:underline">{activity.causerName}</button>
                    {activity.message.replace(activity.causerName, '')}
                </>
            ) : activity.message}
        </p>
        <p className="text-xs text-gray-500 mt-1">{formatTimeAgo(activity.timestamp.toDate().toISOString())} &bull; Community Activity</p>
      </div>
    </div>
  );
};
