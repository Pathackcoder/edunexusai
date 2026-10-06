import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { financeApi } from '../services/api';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';

const FinanceContext = createContext(null);

/** Empty shape so a widget can render before the first response arrives. */
const EMPTY_FINANCE = {
  currentBalance: 0,
  formattedBalance: '$0.00',
  dueDate: null,
  status: '',
  academicYear: '',
  term: '',
  breakdown: [],
  transactions: [],
};

/**
 * Tuition state.
 *
 * Before: the balance was a number in localStorage and a "payment" rewrote that number.
 * Now: the balance is a column in PostgreSQL and a payment is a server transaction that
 * writes the payment row, decrements the balance and creates a notification atomically.
 */
export const FinanceProvider = ({ children }) => {
  const { isAuthenticated, isStudent } = useAuth();
  const { refreshNotifications } = useNotifications();
  const [financeData, setFinanceData] = useState(EMPTY_FINANCE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const enabled = isAuthenticated && isStudent;

  const load = useCallback(async () => {
    if (!enabled) {
      setFinanceData(EMPTY_FINANCE);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setFinanceData(await financeApi.get());
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const makePayment = useCallback(
    async (amount, method) => {
      setIsProcessing(true);
      try {
        const result = await financeApi.pay({
          amount,
          methodType: method?.type,
          methodDisplay: method?.display,
        });
        // The response carries the refreshed account, so no second round trip.
        if (result?.account) setFinanceData(result.account);
        // The backend created the payment notification; pull it in.
        refreshNotifications?.();
        return result;
      } finally {
        setIsProcessing(false);
      }
    },
    [refreshNotifications],
  );

  const resetFinanceBalance = useCallback(async () => {
    const reset = await financeApi.reset();
    setFinanceData(reset);
    return reset;
  }, []);

  const value = useMemo(
    () => ({
      financeData,
      loading,
      error,
      isProcessing,
      makePayment,
      reloadFinance: load,
      resetFinanceBalance,
    }),
    [financeData, loading, error, isProcessing, makePayment, load, resetFinanceBalance],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
