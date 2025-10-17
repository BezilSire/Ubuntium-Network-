import React, { useState, useEffect, useMemo } from 'react';
import { User, Notification, Activity, NotificationItem } from '../types';
import { api } from '../services/apiService';
import { formatTimeAgo } from '../utils';
import { BellIcon } from './icons/BellIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { ThumbsUpIcon } from './icons/ThumbsUpIcon';
import { UsersIcon } from './icons/UsersIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';

interface NotificationsPageProps {
  user: User;
  onNavigate: (item: NotificationItem) => void;
}

const NotificationIcon: React.FC<{ type: NotificationItem['type'] }> = ({ type }) => {
    const className = "h-6 w-6 text-gray-400";
    switch (type) {
        case 'NEW_MESSAGE':
        case 'NEW_CHAT':
            return <MessageSquareIcon className={className} />;
        case 'POST_LIKE': return <ThumbsUpIcon className={className} />;
        case 'NEW_MEMBER': return <UsersIcon className={className} />;
        case 'NEW_POST_PROPOSAL': return <LightbulbIcon className={className} />;
        case 'NEW_POST_OPPORTUNITY': return <BriefcaseIcon className={className} />;
        case 'NEW_POST_OFFER': return <UsersIcon className={className} />;
        case 'NEW_POST_GENERAL': return <MessageSquareIcon className={className} />;
        default: return <BellIcon className={className} />;
    }
};

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ user, onNavigate }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubNotifications = api.listenForNotifications(user.id, (notifs) => {
      setNotifications(notifs);
      setIsLoading(false);
    });
    const unsubActivities = api.listenForActivity((acts) => {
      setActivities(acts);
      setIsLoading(false);
    });

    return () => {
      unsubNotifications();
      unsubActivities();
    };
  }, [user.id]);

  const mergedItems = useMemo((): NotificationItem[] => {
    const personal: NotificationItem[] = notifications.map(n => ({ ...n, itemType: 'notification' }));
    const global: NotificationItem[] = activities.map(a => ({ ...a, itemType: 'activity' }));
    
    const allItems = [...personal, ...global];
    allItems.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
    return allItems;
  }, [notifications, activities]);

  const handleItemClick = (item: NotificationItem) => {
    if (item.itemType === 'notification' && !item.read) {
      api.markNotificationAsRead(item.id).catch(err => console.error("Failed to mark as read:", err));
    }
    onNavigate(item);
  };
  
  const handleMarkAllRead = async () => {
      try {
          await api.markAllNotificationsAsRead(user.id);
      } catch (error) {
          console.error("Failed to mark all as read:", error);
      }
  };

  return (
    <div className="bg-slate-800 p-4 sm:p-6 rounded-lg shadow-lg animate-fade-in max-w-4xl mx-auto">
      <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
        <h2 className="text-2xl font-semibold text-white flex items-center">
            <BellIcon className="h-6 w-6 mr-3 text-green-400" />
            Notifications & Activity
        </h2>
        {notifications.some(n => !n.read) && (
             <button onClick={handleMarkAllRead} className="text-sm text-green-400 hover:text-green-300">
                Mark all as read
            </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-8">Loading notifications...</p>
      ) : mergedItems.length > 0 ? (
        <ul className="space-y-2">
          {mergedItems.map((item) => {
              const isUnread = item.itemType === 'notification' && !item.read;
              const isRecentActivity = item.itemType === 'activity' && (Date.now() - item.timestamp.toMillis()) < 24 * 60 * 60 * 1000;

              return (
                <li key={`${item.itemType}-${item.id}`}>
                    <button 
                        onClick={() => handleItemClick(item)}
                        className={`w-full text-left p-4 rounded-lg flex items-start space-x-4 transition-colors relative overflow-hidden ${isUnread ? 'bg-green-900/40 hover:bg-green-900/60' : 'hover:bg-slate-700/50'}`}
                    >
                        {isRecentActivity && <div className="absolute top-0 left-0 h-full w-1 bg-blue-500" title="Recent Activity"></div>}
                        <div className="flex-shrink-0 mt-1 relative">
                             <NotificationIcon type={item.type} />
                             {isUnread && <span className="absolute -top-1 -right-1 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-slate-800"></span>}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-center">
                                <p className="text-gray-200 text-sm">{item.message}</p>
                                <p className="text-xs text-gray-500 flex-shrink-0 ml-4">{formatTimeAgo(item.timestamp.toDate().toISOString())}</p>
                            </div>
                            <p className={`text-xs mt-1 font-semibold ${item.itemType === 'notification' ? 'text-green-400' : 'text-blue-400'}`}>
                                {item.itemType === 'notification' ? 'Personal Notification' : 'Community Activity'}
                            </p>
                        </div>
                    </button>
                </li>
              )
            })}
        </ul>
      ) : (
        <div className="text-center py-12 text-gray-400">
            <BellIcon className="h-12 w-12 mx-auto text-slate-600 mb-4" />
            <h3 className="font-semibold text-lg text-white">All caught up!</h3>
            <p>You'll see new notifications and community activity here.</p>
        </div>
      )}
    </div>
  );
};