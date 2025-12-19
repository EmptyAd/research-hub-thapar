import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabaseClient';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any }>;
  verifySignUpOtp: (email: string, token: string, password: string, fullName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  sendPasswordResetOtp: (email: string) => Promise<{ error: any }>;
  verifyOtpAndResetPassword: (email: string, token: string, newPassword: string) => Promise<{ error: any }>;
  requestPasswordReset: (email: string) => Promise<{ error: any }>;
  completePasswordReset: (newPassword: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  console.log('AuthProvider - User:', user);
  console.log('AuthProvider - Loading:', loading);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: fullName ? { full_name: fullName } : undefined
      }
    });
    
    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Check your email",
        description: "We've sent you a verification code to complete your registration."
      });
    }
    
    return { error };
  };

  // Password reset via emailed link
  const requestPasswordReset = async (email: string) => {
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      toast({
        title: 'Failed to send reset email',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Reset email sent',
        description: 'Check your inbox for the password reset link.'
      });
    }
    return { error };
  };

  const completePasswordReset = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({
        title: 'Failed to reset password',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Password updated',
        description: 'You can now log in with your new password.'
      });
    }
    return { error };
  };

  const verifySignUpOtp = async (email: string, token: string, password: string, fullName?: string) => {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    
    if (verifyError) {
      toast({
        title: "Invalid OTP",
        description: verifyError.message,
        variant: "destructive"
      });
      return { error: verifyError };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: fullName ? { full_name: fullName } : undefined
    });
    
    if (updateError) {
      toast({
        title: "Failed to complete registration",
        description: updateError.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Registration successful",
        description: "Welcome to ThaparAcad!"
      });
    }
    
    return { error: updateError };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in."
      });
    }
    
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Sign out failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Signed out",
        description: "You have been successfully signed out."
      });
    }
  };

  const sendPasswordResetOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      }
    });
    
    if (error) {
      toast({
        title: "Failed to send OTP",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "OTP sent",
        description: "Please check your email for the verification code."
      });
    }
    
    return { error };
  };

  const verifyOtpAndResetPassword = async (email: string, token: string, newPassword: string) => {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    
    if (verifyError) {
      toast({
        title: "Invalid OTP",
        description: verifyError.message,
        variant: "destructive"
      });
      return { error: verifyError };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });
    
    if (updateError) {
      toast({
        title: "Failed to reset password",
        description: updateError.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Password reset successful",
        description: "You can now login with your new password."
      });
    }
    
    return { error: updateError };
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    verifySignUpOtp,
    signIn,
    signOut,
    sendPasswordResetOtp,
    verifyOtpAndResetPassword,
    requestPasswordReset,
    completePasswordReset
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};