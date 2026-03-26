export const API_CONFIG = {
  baseUrl: '',
  endpoints: {
    createPaymentIntent: '/api/eonmeds/create-intent',
    createCheckoutSession: '/api/eonmeds/create-checkout-session',
    createSubscription: '/api/eonmeds/create-subscription',
    webhook: '/api/eonmeds/webhooks/stripe',
  },
};

export const getApiUrl = (endpoint: keyof typeof API_CONFIG.endpoints): string => {
  return `${API_CONFIG.baseUrl}${API_CONFIG.endpoints[endpoint]}`;
};
