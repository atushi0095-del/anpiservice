import { InviteAcceptance } from "@/components/invite-acceptance";

type InvitePageProps = {
  params: Promise<{ code: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { code } = await params;
  return <InviteAcceptance code={code} />;
}
