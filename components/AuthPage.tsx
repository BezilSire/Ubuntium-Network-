import React, { useState } from 'react';
import { LoginPage } from './LoginPage';
import { SignupPage } from './SignupPage';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { NewPublicMemberData } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { PublicRegistrationPage } from './PublicRegistrationPage';


interface AuthPageProps {}

type AuthView = 'login' | 'agentSignup' | 'publicSignup' | 'forgotPassword';


export const AuthPage: React.FC<AuthPageProps> = () => {
  const { login, agentSignup, memberSignup, sendPasswordReset } = useAuth();
  
  const [view, setView] = useState<AuthView>('login');
  
  const handlePasswordReset = async (email: string) => {
    await sendPasswordReset(email);
    setView('login');
  }


  const resetFlow = () => {
    setView('login');
  }

  const renderContent = () => {
    switch(view) {
        case 'login':
            return (
                <LoginPage 
                    onLogin={login} 
                    onSwitchToSignup={() => setView('agentSignup')} 
                    onSwitchToPublicSignup={() => setView('publicSignup')}
                    onSwitchToForgotPassword={() => setView('forgotPassword')}
                />
            );
        case 'agentSignup':
            return <SignupPage onSignup={agentSignup} onSwitchToLogin={resetFlow} />;
        case 'publicSignup':
            return <PublicRegistrationPage onRegister={memberSignup} onBackToLogin={resetFlow} />;
        case 'forgotPassword':
            return <ForgotPasswordForm onReset={handlePasswordReset} onBack={resetFlow} />
        default:
            return null;
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
        <div key={view} className="animate-fade-in">
            {renderContent()}
        </div>
    </div>
  );
};