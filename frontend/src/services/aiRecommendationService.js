import { buildCustomerMessage } from "../utils/recommendProperties";

export function generateRecommendationSummary(customer, recommendedProperties) {
  return (recommendedProperties || []).map((item) => ({
    ...item,
    customerMessage:
      item.customerMessage ||
      buildCustomerMessage(customer, item.normalizedProperty, item.matchedReasons, item.warnings),
  }));
}

/*
  Future paid AI extension points:
  - Call an AI API only from a Vercel API Route or Supabase Edge Function.
  - Never expose AI API keys in frontend code.
  - Trigger AI calls only after an explicit button click.
  - Do not run automatic background AI calls.
  - Add daily call limits and user-level throttling before enabling paid APIs.
  Current implementation is fully rule-based and does not call OpenAI, Gemini, Claude, or any other paid AI API.
*/
