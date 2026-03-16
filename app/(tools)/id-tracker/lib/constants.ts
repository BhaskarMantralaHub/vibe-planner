export type IDTypeConfig = {
  key: string;
  label: string;
  country: 'US' | 'IN';
  iconName: string;
  hasExpiry: boolean;
  defaultRenewalUrl: string;
};

export const ID_TYPES: IDTypeConfig[] = [
  // US
  { key: 'us_passport', label: 'US Passport', country: 'US', iconName: 'Globe', hasExpiry: true, defaultRenewalUrl: 'https://travel.state.gov/content/travel/en/passports/have-passport/renew.html' },
  { key: 'drivers_license', label: "Driver's License", country: 'US', iconName: 'Car', hasExpiry: true, defaultRenewalUrl: '' },
  { key: 'green_card', label: 'Green Card', country: 'US', iconName: 'CreditCard', hasExpiry: true, defaultRenewalUrl: 'https://www.uscis.gov/green-card/after-we-grant-your-green-card/renew-your-green-card' },
  { key: 'ead', label: 'EAD', country: 'US', iconName: 'FileCheck', hasExpiry: true, defaultRenewalUrl: 'https://www.uscis.gov/i-765' },
  { key: 'h1b_visa', label: 'H1B Visa', country: 'US', iconName: 'Building2', hasExpiry: true, defaultRenewalUrl: 'https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations' },
  { key: 'h4_visa', label: 'H4 Visa', country: 'US', iconName: 'Building2', hasExpiry: true, defaultRenewalUrl: '' },
  { key: 'travel_document', label: 'Travel Document', country: 'US', iconName: 'Plane', hasExpiry: true, defaultRenewalUrl: 'https://www.uscis.gov/i-131' },
  { key: 'state_id', label: 'State ID', country: 'US', iconName: 'IdCard', hasExpiry: true, defaultRenewalUrl: '' },
  { key: 'ssn', label: 'Social Security', country: 'US', iconName: 'Lock', hasExpiry: false, defaultRenewalUrl: 'https://www.ssa.gov/number-card/replace-card' },
  { key: 'global_entry', label: 'Global Entry', country: 'US', iconName: 'ScanLine', hasExpiry: true, defaultRenewalUrl: 'https://ttp.cbp.dhs.gov/' },
  { key: 'tsa_precheck', label: 'TSA PreCheck', country: 'US', iconName: 'ShieldCheck', hasExpiry: true, defaultRenewalUrl: 'https://www.tsa.gov/precheck/renew' },
  // India
  { key: 'indian_passport', label: 'Indian Passport', country: 'IN', iconName: 'Globe', hasExpiry: true, defaultRenewalUrl: 'https://www.passportindia.gov.in/' },
  { key: 'aadhaar', label: 'Aadhaar Card', country: 'IN', iconName: 'Fingerprint', hasExpiry: false, defaultRenewalUrl: 'https://uidai.gov.in/' },
  { key: 'pan_card', label: 'PAN Card', country: 'IN', iconName: 'Landmark', hasExpiry: false, defaultRenewalUrl: 'https://www.onlineservices.nsdl.com/paam/endUserRegisterContact.html' },
  { key: 'indian_dl', label: "Driver's License (IN)", country: 'IN', iconName: 'Car', hasExpiry: true, defaultRenewalUrl: 'https://parivahan.gov.in/' },
  { key: 'voter_id', label: 'Voter ID', country: 'IN', iconName: 'CheckSquare', hasExpiry: false, defaultRenewalUrl: 'https://voters.eci.gov.in/' },
  { key: 'oci_card', label: 'OCI Card', country: 'IN', iconName: 'Globe2', hasExpiry: true, defaultRenewalUrl: 'https://ociservices.gov.in/' },
  // Custom
  { key: 'other_us', label: 'Other (US)', country: 'US', iconName: 'FileText', hasExpiry: true, defaultRenewalUrl: '' },
  { key: 'other_in', label: 'Other (India)', country: 'IN', iconName: 'FileText', hasExpiry: true, defaultRenewalUrl: '' },
];

export const DEFAULT_REMINDER_DAYS = [90, 30, 7];

export const REMINDER_OPTIONS = [
  { value: 180, label: '6 months' },
  { value: 90, label: '3 months' },
  { value: 60, label: '2 months' },
  { value: 30, label: '1 month' },
  { value: 14, label: '2 weeks' },
  { value: 7, label: '1 week' },
  { value: 3, label: '3 days' },
  { value: 1, label: '1 day' },
];
