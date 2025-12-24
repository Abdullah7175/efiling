"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState({
    name: 'Guest',
    image: '/avatar.png',
    role: 0,
    userType: null
  });
  const [loading, setLoading] = useState(true);
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') {
      return; // Still loading, don't do anything
    }

    if (status === 'authenticated' && session?.user) {
      // User is authenticated, set user data from session
      setUser({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image || '/avatar.png',
        role: session.user.role,
        userType: session.user.userType
      });
    } else if (status === 'unauthenticated') {
      // User is not authenticated, set guest user
      setUser({
        name: 'Guest',
        image: '/avatar.png',
        role: 0,
        userType: null
      });
    }
    
    setLoading(false);
  }, [status, session]);

  const login = async (token, userData) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      setUser({
        name: 'Guest',
        image: '/avatar.png',
        role: 0,
        userType: null
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <UserContext.Provider value={{ user, loading, logout, login }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUserContext = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
};