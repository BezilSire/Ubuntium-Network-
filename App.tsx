import React, { useState, useEffect } from 'react';
import { AgentDashboard } from './components/AgentDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { MemberDashboard } from './components/MemberDashboard';
import { AuthPage } from './components/AuthPage';
import { Header } from './components/Header';
import { User, Agent, Broadcast, MemberUser, Admin } from './types';
import { useToast } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { api } from './services/apiService';
import { Sidebar } from './components/Sidebar';
import { BottomNavBar } from './components/BottomNavBar';
import { useAuth } from './contexts/AuthContext';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { AppInstallBanner } from './components/AppInstallBanner';
import { useProfileCompletionReminder } from './hooks/useProfileCompletionReminder';
import { PublicProfile } from './components/PublicProfile';
import { CompleteProfilePage } from './components/CompleteProfilePage';

type AgentView = 'dashboard' | 'members' | 'profile' | 'notifications';

const App: React.FC = () => {
  const { currentUser, isLoadingAuth, logout, updateUser, firebaseUser } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const { addToast } = useToast();
  const isOnline = useOnlineStatus();
  const [hasSyncedOnConnect, setHasSyncedOnConnect] = useState(true);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // State for Agent Dashboard UI
  const [agentView, setAgentView] = useState<AgentView>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Global state for viewing a user profile from anywhere (e.g., search)
  const [globalViewingProfileId, setGlobalViewingProfileId] = useState<string | null>(null);

  // Hook to remind users to complete their profile
  useProfileCompletionReminder(currentUser);


  useEffect(() => {
    const fetchBroadcasts = async () => {
      try {
        const initialBroadcasts = await api.getBroadcasts();
        setBroadcasts(initialBroadcasts);
      } catch (error) {
        addToast('Could not load broadcasts.', 'error');
      }
    };

    if (currentUser) {
        fetchBroadcasts();
        const unsubNotifications = api.listenForNotifications(currentUser.id, (notifications) => {
            const unread = notifications.filter(n => !n.read).length;
            setUnreadNotificationCount(unread);
        });
        return () => unsubNotifications();
    } else {
        setUnreadNotificationCount(0);
    }
  }, [currentUser, addToast]);

  useEffect(() => {
    // This effect handles the automatic syncing of queued data when the application comes back online.
    if (isOnline && !hasSyncedOnConnect && currentUser) {
      // Only agents or admins, who can create members, need to trigger this sync.
      if (currentUser.role === 'agent' || currentUser.role === 'admin') {
        console.log("Connection restored. Checking for pending welcome messages to generate...");
        
        api.processPendingWelcomeMessages()
          .then(count => {
            if (count > 0) {
              addToast(`Successfully generated ${count} welcome message(s) for members registered offline.`, 'info');
            }
          })
          .catch(error => {
            console.error("Error during automatic offline data sync:", error);
            addToast("An error occurred while syncing some offline data.", "error");
          });
      }
      // Mark that we've attempted a sync for this online session.
      setHasSyncedOnConnect(true);
    } else if (!isOnline) {
      // When the app goes offline, reset the flag so that a sync will be attempted
      // the next time it comes online.
      if (hasSyncedOnConnect) {
        setHasSyncedOnConnect(false);
      }
    }
  }, [isOnline, hasSyncedOnConnect, currentUser, addToast]);


  const handleLogoutWithReset = async () => {
    await logout();
    setAgentView('dashboard'); // Reset local UI state on logout
  };

  const handleSendBroadcast = async (message: string) => {
    const newBroadcast = await api.sendBroadcast(message);
    setBroadcasts(prev => [newBroadcast, ...prev]);
    addToast('Broadcast sent successfully.', 'success');
  };

  const handleViewProfile = (userId: string | null) => {
    setGlobalViewingProfileId(userId);
  };


  if (isLoadingAuth) {
    return (
        <div className="min-h-screen bg-gray-100 dark:bg-slate-900 flex items-center justify-center">
            <p className="text-slate-700 dark:text-white text-lg">Loading Portal...</p>
        </div>
    );
  }
  
  const renderFullScreenPage = (content: React.ReactNode) => (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-slate-800 dark:text-gray-200">
      <ToastContainer />
      <Header user={currentUser} onLogout={handleLogoutWithReset} onViewProfile={handleViewProfile} />
      <main className="p-4 sm:p-6 lg:p-8">
          {content}
      </main>
    </div>
  );

  // Step 1: Check for mandatory profile completion
  if (currentUser && !currentUser.isProfileComplete) {
    return renderFullScreenPage(<CompleteProfilePage user={currentUser} onProfileComplete={async (data) => { await updateUser({ ...data, isCompletingProfile: true }) }} />);
  }


  // Step 2: If a profile is being viewed globally, render it.
  if (globalViewingProfileId && currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-slate-800 dark:text-gray-200">
        <ToastContainer />
        <Header 
          user={currentUser} 
          onLogout={handleLogoutWithReset}
          onViewProfile={handleViewProfile}
        />
        <main className="p-4 sm:p-6 lg:p-8">
            <PublicProfile 
                userId={globalViewingProfileId}
                currentUser={currentUser}
                onBack={() => setGlobalViewingProfileId(null)}
                onStartChat={async (targetUserId: string) => {
                  try {
                    const targetUser = await api.getUserProfile(targetUserId);
                    if (!targetUser) {
                      addToast("User not found.", "error");
                      return;
                    }
                    await api.startChat(currentUser.id, targetUserId, currentUser.name, targetUser.name);
                    setGlobalViewingProfileId(null);
                    addToast("Please navigate to the 'Connect' tab to see your new chat.", 'info');
                  } catch (e) {
                    addToast("Could not start chat.", "error");
                  }
                }}
                onViewProfile={handleViewProfile} // Allows navigating from profile to profile
            />
        </main>
      </div>
    );
  }

  const renderDashboard = () => {
    if (!currentUser) {
        return (
             <main className="p-4 sm:p-6 lg:p-8">
                <AuthPage />
            </main>
        );
    }

    switch (currentUser.role) {
        case 'admin':
            return (
                <main className="p-4 sm:p-6 lg:p-8">
                    <AdminDashboard 
                        user={currentUser as Admin} 
                        broadcasts={broadcasts} 
                        onSendBroadcast={handleSendBroadcast} 
                        onUpdateUser={updateUser}
                        unreadCount={unreadNotificationCount}
                        onViewProfile={handleViewProfile}
                    />
                </main>
            );
        case 'member':
            return (
                 <main className="p-4 sm:p-6 lg:p-8">
                    <MemberDashboard 
                        user={currentUser as MemberUser} 
                        broadcasts={broadcasts} 
                        onUpdateUser={updateUser}
                        unreadCount={unreadNotificationCount}
                        onViewProfile={handleViewProfile}
                    />
                </main>
            );
        case 'agent':
             return (
                  <>
                    <div className="hidden md:block">
                      <Sidebar
                        agent={currentUser as Agent}
                        activeView={agentView}
                        setActiveView={setAgentView}
                        isCollapsed={isSidebarCollapsed}
                        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
                        onLogout={handleLogoutWithReset}
                        unreadCount={unreadNotificationCount}
                      />
                    </div>
                    <main className={`pb-24 md:pb-0 md:transition-[margin-left] md:duration-300 md:ease-in-out ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
                        <AgentDashboard 
                          user={currentUser as Agent} 
                          broadcasts={broadcasts} 
                          onUpdateUser={updateUser}
                          activeView={agentView}
                          setActiveView={setAgentView}
                          onViewProfile={handleViewProfile}
                        />
                    </main>
                    <div className="md:hidden">
                       <BottomNavBar
                            agent={currentUser as Agent}
                            activeView={agentView}
                            setActiveView={setAgentView}
                            onLogout={handleLogoutWithReset}
                            unreadCount={unreadNotificationCount}
                        />
                    </div>
                  </>
             );
        default:
             return <p>Unknown user role.</p>;
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-slate-800 dark:text-gray-200">
      <ToastContainer />
      <Header user={currentUser} onLogout={handleLogoutWithReset} onViewProfile={handleViewProfile} />
      {renderDashboard()}
      <AppInstallBanner />
    </div>
  );
};

export default App;