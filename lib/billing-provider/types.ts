/**
 * Billing provider abstraction — Polar-ready interfaces without Polar clients.
 * Stripe remains read-only via profile columns; mutations stay on existing paths.
 */

export type BillingProviderId = "stripe" | "polar" | "none";

export type BillingCustomer = {
  provider: BillingProviderId;
  customerId: string | null;
  email?: string | null;
};

export type BillingSubscription = {
  provider: BillingProviderId;
  subscriptionId: string | null;
  status: string;
  planId?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

export type BillingProvider = {
  id: BillingProviderId;
  connected: boolean;
  getCustomer(profileId: string): Promise<BillingCustomer | null>;
  getSubscription(profileId: string): Promise<BillingSubscription | null>;
  changePlan(opts: {
    profileId: string;
    planId: string;
  }): Promise<BillingSubscription>;
  cancel(opts: {
    profileId: string;
    atPeriodEnd?: boolean;
  }): Promise<BillingSubscription>;
  reactivate(opts: { profileId: string }): Promise<BillingSubscription>;
  sync(opts: { profileId: string }): Promise<BillingSubscription | null>;
};

export class BillingProviderNotConnectedError extends Error {
  constructor(provider: BillingProviderId = "polar") {
    super(`Billing provider not connected (${provider}).`);
    this.name = "BillingProviderNotConnectedError";
  }
}

/** Stub until Polar (or another provider) is wired. */
export const NotConnectedBillingProvider: BillingProvider = {
  id: "polar",
  connected: false,
  async getCustomer() {
    return null;
  },
  async getSubscription() {
    return null;
  },
  async changePlan() {
    throw new BillingProviderNotConnectedError("polar");
  },
  async cancel() {
    throw new BillingProviderNotConnectedError("polar");
  },
  async reactivate() {
    throw new BillingProviderNotConnectedError("polar");
  },
  async sync() {
    return null;
  },
};

export function resolveBillingProviderDisplay(profile: {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
}): BillingProviderId {
  if (profile.stripe_customer_id || profile.stripe_subscription_id) {
    return "stripe";
  }
  return "none";
}
