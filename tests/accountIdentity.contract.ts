import type { AccountProfile } from '../src/domain/accountIdentity.ts';

const profile: AccountProfile = {
  userId: 'member-1',
  name: 'Member Name',
  loginEmail: 'login@example.org',
  contactEmail: 'contact@example.org',
  university: 'University',
  major: 'Major',
  year: '3',
  phone: '+90 555 000 0000',
  bio: 'Short profile',
  photo: 'avatars/member.webp',
  // @ts-expect-error Executive position belongs to an assignment, never a profile.
  role: 'PRESIDENT',
};

void profile;
