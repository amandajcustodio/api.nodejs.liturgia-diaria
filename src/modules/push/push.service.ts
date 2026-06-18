import { getFirestore } from "firebase-admin/firestore";
import webpush, { PushSubscription } from "web-push";

const SUBSCRIPTIONS_COLLECTION = "push_subscriptions";
const STATE_COLLECTION = "push_state";

type PushPayloadType = "available" | "reminder";

type SubscriptionDoc = {
  subscription: PushSubscription;
  updatedAt?: string;
  lastSeenSundayDate?: string | null;
  lastReminderDate?: string | null;
};

function initVapid(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL ?? "mailto:amandajcustodio@outlook.com";

  if (!publicKey || !privateKey) {
    return;
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
}

initVapid();

function subscriptionDocId(endpoint: string): string {
  return Buffer.from(endpoint).toString("base64").replace(/[+/=]/g, "").slice(-80);
}

function buildPayload(type: PushPayloadType, pdfUrl: string): { title: string; body: string; url: string; tag: string } {
  if (type === "available") {
    return {
      title: "Folheto de Domingo disponível! 📖",
      body: "O folheto de domingo desta semana já está disponível.",
      url: pdfUrl,
      tag: "sunday-booklet-available",
    };
  }

  return {
    title: "Lembrete: folheto de domingo 📖",
    body: "O folheto desta semana está disponível. Abra o app para conferir.",
    url: "/",
    tag: "sunday-booklet-reminder",
  };
}

export class PushService {
  private readonly db = getFirestore();

  async saveSubscription(subscription: PushSubscription): Promise<void> {
    const id = subscriptionDocId(subscription.endpoint);
    await this.db.collection(SUBSCRIPTIONS_COLLECTION).doc(id).set({
      subscription,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  async removeSubscription(endpoint: string): Promise<void> {
    const id = subscriptionDocId(endpoint);
    await this.db.collection(SUBSCRIPTIONS_COLLECTION).doc(id).delete();
  }

  async markBookletSeen(endpoint: string, sundayIsoDate: string): Promise<void> {
    const id = subscriptionDocId(endpoint);
    await this.db.collection(SUBSCRIPTIONS_COLLECTION).doc(id).set({
      lastSeenSundayDate: sundayIsoDate,
      lastSeenAt: new Date().toISOString(),
    }, { merge: true });
  }

  private async sendToSubscription(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
    payload: { title: string; body: string; url: string; tag: string },
    mergeFields?: Record<string, string>
  ): Promise<boolean> {
    const { subscription } = doc.data() as SubscriptionDoc;

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));

      if (mergeFields) {
        await doc.ref.set(mergeFields, { merge: true });
      }

      return true;
    } catch (error: unknown) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        await doc.ref.delete();
      }

      return false;
    }
  }

  async sendSundayBookletNotification(pdfUrl: string, todayIso: string): Promise<number> {
    const snapshot = await this.db.collection(SUBSCRIPTIONS_COLLECTION).get();

    if (snapshot.empty) {
      return 0;
    }

    const payload = buildPayload("available", pdfUrl);

    const sends = snapshot.docs.map((doc) =>
      this.sendToSubscription(doc, payload, { lastReminderDate: todayIso })
    );

    const results = await Promise.allSettled(sends);
    return results.filter((result) => result.status === "fulfilled" && result.value).length;
  }

  async sendDailyBookletReminders(
    pdfUrl: string,
    sundayIsoDate: string,
    todayIso: string
  ): Promise<number> {
    const snapshot = await this.db.collection(SUBSCRIPTIONS_COLLECTION).get();

    if (snapshot.empty) {
      return 0;
    }

    const payload = buildPayload("reminder", pdfUrl);

    const sends = snapshot.docs.map(async (doc) => {
      const data = doc.data() as SubscriptionDoc;

      if (data.lastSeenSundayDate === sundayIsoDate) {
        return false;
      }

      if (data.lastReminderDate === todayIso) {
        return false;
      }

      return this.sendToSubscription(doc, payload, { lastReminderDate: todayIso });
    });

    const results = await Promise.allSettled(sends);
    return results.filter((result) => result.status === "fulfilled" && result.value).length;
  }

  async getLastNotifiedBookletUrl(): Promise<string | null> {
    const doc = await this.db.collection(STATE_COLLECTION).doc("sunday_booklet").get();
    return doc.exists ? ((doc.data()?.lastNotifiedUrl as string) ?? null) : null;
  }

  async getLastNotifiedSundayDate(): Promise<string | null> {
    const doc = await this.db.collection(STATE_COLLECTION).doc("sunday_booklet").get();
    return doc.exists ? ((doc.data()?.lastNotifiedSundayDate as string) ?? null) : null;
  }

  async setLastNotifiedBookletUrl(url: string, sundayIsoDate: string): Promise<void> {
    await this.db.collection(STATE_COLLECTION).doc("sunday_booklet").set({
      lastNotifiedUrl: url,
      lastNotifiedSundayDate: sundayIsoDate,
      notifiedAt: new Date().toISOString(),
    });
  }
}
