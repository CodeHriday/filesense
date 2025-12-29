import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QueryKeys, STALE_TIMES, CACHE_TIMES } from '../lib/react-query';

const fetchNotifications = async () => {
  const response = await axios.get('/api/notifications');
  return response.data;
};

const markNotificationAsRead = async (notificationId) => {
  const response = await axios.put(`/api/notifications/${notificationId}/read`);
  return response.data;
};

const markAllNotificationsAsRead = async () => {
  const response = await axios.put('/api/notifications/read-all');
  return response.data;
};

export const useAPINotifications = (options = {}) => {
  return useQuery({
    queryKey: QueryKeys.notifications.all,
    queryFn: fetchNotifications,
    staleTime: STALE_TIMES.FILES,
    gcTime: CACHE_TIMES.STANDARD,
    refetchOnMount: false,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    ...options
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.notifications.all });
    }
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: markAllNotificationsAsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QueryKeys.notifications.all });
      
      const previousData = queryClient.getQueryData(QueryKeys.notifications.all);
      
      queryClient.setQueryData(QueryKeys.notifications.all, (old) => {
        if (!old) return old;
        return {
          ...old,
          notifications: (old.notifications || []).map(n => ({ ...n, is_read: true }))
        };
      });
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(QueryKeys.notifications.all, context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.notifications.all });
    }
  });
};

export const useInvalidateNotifications = () => {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: QueryKeys.notifications.all });
  };
};
