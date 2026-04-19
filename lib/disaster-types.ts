export type EmergencyStatus = "safe" | "need_help" | "unavailable";

export type HouseholdMember = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  notes: string;
  latestStatus: EmergencyStatus;
  latestStatusAt?: string;
};

export type EmergencyContact = {
  id: string;
  label: string;
  name: string;
  phone: string;
};

export type EvacuationPlace = {
  id: string;
  name: string;
  address: string;
  note: string;
};

export type DisasterRule = {
  id: string;
  title: string;
  body: string;
};

export type MedicalNote = {
  id: string;
  memberName: string;
  body: string;
};

export type SupplyCategory = "water" | "food" | "battery" | "medicine" | "baby" | "pet" | "other";

export type SupplyItem = {
  id: string;
  name: string;
  category: SupplyCategory;
  quantity: string;
  ownerName?: string;
  note?: string;
  expiresAt: string;
  checked: boolean;
};

export type SafetyStatusLog = {
  id: string;
  memberId: string;
  memberName: string;
  status: EmergencyStatus;
  message: string;
  locationText?: string;
  createdAt: string;
};

export type NotificationSettings = {
  monthlyReview: boolean;
  syncEnabled: boolean;
  locationShareEnabled: boolean;
};

export type DisasterNoteData = {
  householdName: string;
  lastReviewedAt: string;
  members: HouseholdMember[];
  emergencyContacts: EmergencyContact[];
  evacuationPlaces: EvacuationPlace[];
  disasterRules: DisasterRule[];
  medicalNotes: MedicalNote[];
  supplyItems: SupplyItem[];
  statusLogs: SafetyStatusLog[];
  notificationSettings: NotificationSettings;
  templateMessages: string[];
};
