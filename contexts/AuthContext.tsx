import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from './ToastContext';
import { api } from '../services/apiService';
import { auth, db } from '../services/firebase';
import { User, Agent, NewPublicMemberData, Member } from '../types';

// Define the shape of the context value
interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  isLoadingAuth: boolean;
  isProcessingAuth: boolean;
  login: (credentials: Pick<User, 'email' | 'password'>) => Promise<void>;
  logout: () => Promise<void>;
  agentSignup: (credentials: Pick<Agent, 'name' | 'email' | 'password' | 'circle'>) => Promise<void>;
  memberSignup: (memberData: NewPublicMemberData, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateUser: (updatedUser: Partial<User>) => Promise<void>;
}

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create the Provider component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && !user.isAnonymous) {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = { id: userDoc.id, ...userDoc.data() } as User;
          if (userData.status === 'ousted') {
            await api.logout();
            setCurrentUser(null);
            addToast('Your account has been suspended.', 'error');
          } else {
            setCurrentUser(userData);
            api.setupPresence(user.uid);
          }
        } else {
          // A permanent user is authenticated but has no profile document.
          // If we are NOT in the middle of creating this user, it's an orphaned account from a failed registration.
          if (!isProcessingAuth) {
            console.warn("Orphaned user detected (Auth user exists without a profile). Logging out.");
            await api.logout();
            setCurrentUser(null);
          }
          // If isProcessingAuth IS true, we do nothing. We are in the process of creating the user doc,
          // so we wait for that process to finish. This prevents a race condition.
        }
      } else {
        // This handles both logged-out users and anonymous users for the registration flow,
        // ensuring the main application state remains logged-out.
        setCurrentUser(null);
      }
      setIsLoadingAuth(false);
    });

    return () => unsubscribe();
  }, [isProcessingAuth, addToast]);

  const login = useCallback(async (credentials: Pick<User, 'email' | 'password'>) => {
    try {
      const user = await api.login(credentials.email, credentials.password);
      if (user) {
        addToast('Logged in successfully!', 'success');
      } else {
        addToast('Login failed: User profile not found.', 'error');
        await api.logout();
        throw new Error("Login failed: Profile not found.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      if (errorMessage.includes("suspended")) {
        addToast('This account has been suspended.', 'error');
      } else if (!errorMessage.includes("Profile not found")) {
        addToast('Invalid credentials. Please check your email and password.', 'error');
      }
      throw error;
    }
  }, [addToast]);

  const logout = useCallback(async () => {
    if (currentUser) {
        api.goOffline(currentUser.id);
    }
    await api.logout();
    addToast('You have been logged out.', 'info');
  }, [addToast, currentUser]);

  const agentSignup = useCallback(async (credentials: Pick<Agent, 'name' | 'email' | 'password' | 'circle'>) => {
    setIsProcessingAuth(true);
    try {
      await api.signup(credentials.name, credentials.email, credentials.password, credentials.circle);
      addToast(`Account created! Please check your email to verify your account.`, 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      addToast(`Signup failed: ${errorMessage}`, 'error');
      throw error;
    } finally {
      setIsProcessingAuth(false);
    }
  }, [addToast]);

  const memberSignup = useCallback(async (memberData: NewPublicMemberData, password: string) => {
    setIsProcessingAuth(true);
    try {
        await api.memberSignup(memberData, password);
        addToast(`Registration submitted! Please verify your email. An admin will review it shortly.`, 'success');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Signup failed: ${errorMessage}`, 'error');
        throw error;
    } finally {
        setIsProcessingAuth(false);
    }
  }, [addToast]);
  
  const sendPasswordReset = useCallback(async (email: string) => {
    try {
        await api.sendPasswordReset(email);
        addToast(`A password reset link has been sent to ${email}.`, 'success');
    } catch (error) {
        addToast("Failed to send password reset email. Please check the address and try again.", "error");
        throw error;
    }
  }, [addToast]);

  const updateUser = useCallback(async (updatedData: Partial<User>) => {
    if (!currentUser) return;
    try {
      const freshUser = await api.updateUser(currentUser.id, updatedData);
      setCurrentUser(prev => prev ? {...prev, ...freshUser} : null); // Update context state
      addToast('Profile updated successfully!', 'success');
    } catch (error) {
      console.error("Failed to update user:", error);
      addToast('Profile update failed.', 'error');
      throw error;
    }
  }, [currentUser, addToast]);


  const value = {
    currentUser,
    firebaseUser,
    isLoadingAuth,
    isProcessingAuth,
    login,
    logout,
    agentSignup,
    memberSignup,
    sendPasswordReset,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Create the custom hook for consuming the context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
