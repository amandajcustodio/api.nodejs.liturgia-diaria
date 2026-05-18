import { getFirestore } from "firebase-admin/firestore";
import webpush, { PushSubscription } from "web-push";

const SUBSCRIPTIONS_COLLECTION = "push_subscriptions";
const STATE_COLLECTION = "push_state";

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

export class PushService {
  private readonly db = getFirestore();

  async saveSubscription(subscription: PushSubscription): Promise<void> {
    const id = subscriptionDocId(subscription.endpoint);
    await this.db.collection(SUBSCRIPTIONS_COLLECTION).doc(id).set({
      subscription,
      updatedAt: new Date().toISOString(),
    });
  }

  async removeSubscription(endpoint: string): Promise<void> {
    const id = subscriptionDocId(endpoint);
    await this.db.collection(SUBSCRIPTIONS_COLLECTION).doc(id).delete();
  }

  async sendSundayBookletNotification(pdfUrl: string): Promise<void> {
    const snapshot = await this.db.collection(SUBSCRIPTIONS_COLLECTION).get();

    if (snapshot.empty) {
      return;
    }

    const payload = JSON.stringify({
      title: "Folheto de Domingo disponível! 📖",
      body: "O folheto de domingo desta semana já está disponível.",
      url: pdfUrl,
    });

    const sends = snapshot.docs.map(async (doc) => {
      const { subscription } = doc.data() as { subscription: PushSubscription };
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (error: unknown) {
        const status = (error as { statusCode?: number }).statusCode;
        // Remove expired or invalid subscriptions
        if (status === 410 || status === 404) {
          await doc.ref.delete();
        }
      }
    });

    await Promise.allSettled(sends);
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
