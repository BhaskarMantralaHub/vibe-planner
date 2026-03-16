export type IDCountry = 'US' | 'IN';

export type IDDocument = {
  id: string;
  user_id: string;
  id_type: string;
  country: IDCountry;
  label: string;
  owner_name: string;
  description: string;
  expiry_date: string | null;
  renewal_url: string;
  reminder_days: number[];
  created_at: string;
  updated_at: string;
};
