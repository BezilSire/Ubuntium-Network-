import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Broadcast } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { UserCard } from './UserCard';
import { LoaderIcon } from './icons/LoaderIcon';
import { ActivityFeed } from './ActivityFeed';
import { MegaphoneIcon } from './icons/MegaphoneIcon';
import { DocumentData, DocumentSnapshot } from 'firebase/firestore';

interface CommunityPageProps {
  currentUser: User;
  onViewProfile: (userId: string | null) => void;
  onUpdateUser: (updatedUser: Partial<User>) => Promise<void>;
  broadcasts: Broadcast[];
}

const MEMBERS_PER_PAGE = 24; // Number of members to load per "page"

const BroadcastsSection: React.FC<{ broadcasts: Broadcast[] }> = ({ broadcasts }) => (
    <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
      <h3 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
        <MegaphoneIcon className="h-5 w-5 mr-2 text-green-400"/>
        Admin Broadcasts
      </h3>
      {broadcasts.length > 0 ? (
        <ul className="space-y-4 max-h-64 overflow-y-auto">
          {broadcasts.slice(0, 5).map(b => (
            <li key={b.id} className="border-b border-slate-700 pb-3 last:border-b-0">
              <div
                className="text-sm text-gray-300 wysiwyg-content"
                dangerouslySetInnerHTML={{ __html: b.message }}
              />
              <p className="text-xs text-gray-500 mt-1">{new Date(b.date).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">No recent broadcasts from admins.</p>
      )}
    </div>
);


export const CommunityPage: React.FC<CommunityPageProps> = ({ currentUser, onViewProfile, onUpdateUser, broadcasts }) => {
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, boolean>>({});
  const { addToast } = useToast();

  // Observer for triggering more member loads
  const observer = useRef<IntersectionObserver>();

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore || !lastVisible) return;
    setIsLoadingMore(true);
    api.fetchCommunityMembersPaginated(MEMBERS_PER_PAGE, lastVisible)
        .then(({ users, lastVisible: newLastVisible }) => {
            const filteredUsers = users.filter(u => u.id !== currentUser.id);
            setMembers(prev => [...prev, ...filteredUsers]);
            setLastVisible(newLastVisible);
            if (users.length < MEMBERS_PER_PAGE || !newLastVisible) {
                setHasMore(false);
            }
        })
        .catch(() => addToast("Could not load more members.", "error"))
        .finally(() => setIsLoadingMore(false));
  }, [isLoadingMore, hasMore, lastVisible, currentUser.id, addToast]);

  const lastMemberElementRef = useCallback(node => {
    if (isLoading || isLoadingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });

    if (node) observer.current.observe(node);
  }, [isLoading, isLoadingMore, hasMore, loadMore]);

  // Initial fetch
  useEffect(() => {
    setIsLoading(true);
    api.fetchCommunityMembersPaginated(MEMBERS_PER_PAGE)
      .then(({ users, lastVisible: newLastVisible }) => {
          const filteredUsers = users.filter(u => u.id !== currentUser.id);
          setMembers(filteredUsers);
          setLastVisible(newLastVisible);
          if (users.length < MEMBERS_PER_PAGE || !newLastVisible) {
              setHasMore(false);
          }
      })
      .catch(() => addToast("Could not load community members.", "error"))
      .finally(() => setIsLoading(false));
  }, [currentUser.id, addToast]);
  
  // Listen for presence status of all displayed users
  useEffect(() => {
    const memberIds = members.map(u => u.id).filter((id): id is string => !!id);

    if (memberIds.length > 0) {
        const unsubscribe = api.listenForUsersPresence(memberIds, (statuses) => {
            setOnlineStatuses(prev => ({ ...prev, ...statuses }));
        });
        return () => unsubscribe();
    }
  }, [members]);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Community</h1>
        <p className="text-lg text-gray-400">Discover and connect with members in the commons.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
            <section>
              <h2 className="text-xl font-semibold text-white mb-4">All Members ({members.length}{hasMore ? '+' : ''})</h2>
              {isLoading ? (
                  <div className="flex justify-center items-center h-24"><LoaderIcon className="h-8 w-8 animate-spin text-green-500" /></div>
              ) : members.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {members.map((user, index) => (
                            <div ref={members.length === index + 1 ? lastMemberElementRef : null} key={user.id}>
                                <UserCard 
                                    user={user}
                                    currentUser={currentUser}
                                    onClick={() => onViewProfile(user.id)}
                                    isOnline={onlineStatuses[user.id]} 
                                />
                            </div>
                        ))}
                    </div>
                    {isLoadingMore && (
                        <div className="flex justify-center items-center py-8">
                            <LoaderIcon className="h-8 w-8 animate-spin text-green-500" />
                        </div>
                    )}
                  </>
              ) : (
                  <p className="text-gray-500">No other members found in the community.</p>
              )}
            </section>
        </div>
        
        <aside className="lg:col-span-1 space-y-6">
            <BroadcastsSection broadcasts={broadcasts} />
            <section>
                <h2 className="text-xl font-semibold text-white mb-4">Recent Activity in Your Circle</h2>
                <ActivityFeed user={currentUser} onViewProfile={onViewProfile} />
            </section>
        </aside>
      </div>
    </div>
  );
};