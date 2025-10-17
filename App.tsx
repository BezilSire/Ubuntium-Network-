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

type AgentView = 'dashboard' | 'members' | 'profile';

const App: React.FC = () => {
  const { currentUser, isLoadingAuth, logout, updateUser } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const { addToast } = useToast();
  const isOnline = useOnlineStatus();
  const [hasSyncedOnConnect, setHasSyncedOnConnect] = useState(true);

  // State for Agent Dashboard UI
  const [agentView, setAgentView] = useState<AgentView>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);


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

  if (isLoadingAuth) {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <p className="text-white text-lg">Loading Portal...</p>
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
                      />
                    </div>
                    <main className={`pb-24 md:pb-0 md:transition-[margin-left] md:duration-300 md:ease-in-out ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
                        <AgentDashboard 
                          user={currentUser as Agent} 
                          broadcasts={broadcasts} 
                          onUpdateUser={updateUser}
                          activeView={agentView}
                        />
                    </main>
                    <div className="md:hidden">
                       <BottomNavBar
                            agent={currentUser as Agent}
                            activeView={agentView}
                            setActiveView={setAgentView}
                            onLogout={handleLogoutWithReset}
                        />
                    </div>
                  </>
             );
        default:
             return <p>Unknown user role.</p>;
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-gray-200">
      <ToastContainer />
      <Header user={currentUser} onLogout={handleLogoutWithReset} />
      {renderDashboard()}
      <AppInstallBanner />
    </div>
  );
};

export default App;
