import { AppConfig } from './config';
import { ProductBoostResult } from './booster';

export interface ProductResultPayload {
  id: number | string;
  name: string;
  searchQuery: string;
  status: 'BOOSTED' | 'ALREADY_BOOSTING' | 'NOT_FOUND' | 'FAILED' | 'LIMIT_REACHED';
  isSuccess: boolean;
  remainingMinutes: number | null;
  message: string;
}

export interface OverallCycleWebhookPayload {
  account: string;
  timestamp: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  totalProducts: number;
  summary: {
    boosted: number;
    alreadyBoosting: number;
    failed: number;
  };
  nextRunInMinutes?: number;
  products: ProductResultPayload[];
  errorMessage?: string;
}

/**
 * Sends one consolidated notification payload to n8n webhook at the end of each cycle.
 * Non-blocking and failsafe: network issues will never interrupt the main boosting loop.
 */
export async function sendOverallWebhook(
  config: AppConfig,
  payload: OverallCycleWebhookPayload
): Promise<void> {
  if (!config.n8nWebhookUrl || config.n8nWebhookUrl.trim() === '') {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(config.n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Shopee-AutoBoost/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[Webhook] n8n returned HTTP ${res.status}: ${res.statusText}`);
    } else {
      console.log(`[Webhook] Laporan keseluruhan siklus berhasil dikirim ke n8n (${payload.status}).`);
    }
  } catch (err) {
    console.warn(`[Webhook] Warning: Gagal mengirim ke n8n: ${(err as Error).message}`);
  }
}
