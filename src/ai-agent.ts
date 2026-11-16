import { Page } from 'playwright';
import OpenAI from 'openai';
import { AppConfig } from './config';

interface AIModalDecision {
  hasModal: boolean;
  action?: 'click' | 'none';
  buttonText?: string;
  isCloseIcon?: boolean;
  xPercent?: number;
  yPercent?: number;
  description?: string;
}

let openAiClient: OpenAI | null = null;

function getClient(config: AppConfig): OpenAI | null {
  if (!config.ninerouterApiKey) {
    return null;
  }
  if (!openAiClient) {
    openAiClient = new OpenAI({
      apiKey: config.ninerouterApiKey,
      baseURL: config.ninerouterBaseUrl,
    });
  }
  return openAiClient;
}

/**
 * Uses 9Router AI Vision to inspect the current page screenshot,
 * detect any blocking modals/popups/tooltips, and dismiss them automatically.
 */
export async function dismissModalsWithAI(page: Page, config: AppConfig): Promise<boolean> {
  const client = getClient(config);
  if (!client) {
    // 9Router is not configured, skip AI inspection
    return false;
  }

  console.log(`[AI-Vision] Memeriksa tampilan layar dengan AI (9Router: ${config.ninerouterModel})...`);

  const maxAttempts = 2;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      // 1. Capture screenshot of current viewport
      const screenshotBuffer = await page.screenshot({ fullPage: false });
      const base64Image = screenshotBuffer.toString('base64');

      // 2. Ask 9Router Vision model to analyze the screen
      const response = await client.chat.completions.create({
        model: config.ninerouterModel,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content:
              'You are a browser automation helper. Analyze the web screenshot from Shopee Seller Center. ' +
              'Determine if there is any pop-up, modal, onboarding guide, tooltip, or banner overlay that is blocking or covering the product list table. ' +
              'Respond strictly in valid JSON format.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Check if there is any modal, pop-up, update announcement, banner, onboarding guide, or confirmation dialog blocking the view.\n' +
                  'If YES, find the best button to dismiss, skip, or close it (such as "Cek Sekarang", "Skip", "Lewati", "Batal", "Tutup", "Close", or an "X" close icon in the top right of the modal).\n\n' +
                  'Return ONLY a JSON object in this exact schema:\n' +
                  '{\n' +
                  '  "hasModal": true or false,\n' +
                  '  "action": "click",\n' +
                  '  "buttonText": "<exact label text visible on button, or empty string if it is an X icon>",\n' +
                  '  "isCloseIcon": true or false,\n' +
                  '  "xPercent": <approximate horizontal percentage position from 0 to 100 on screen>,\n' +
                  '  "yPercent": <approximate vertical percentage position from 0 to 100 on screen>,\n' +
                  '  "description": "<brief description of what was detected>"\n' +
                  '}',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
      });

      const replyContent = response.choices[0]?.message?.content?.trim() || '';
      const cleanJsonMatch = replyContent.match(/\{[\s\S]*\}/);
      if (!cleanJsonMatch) {
        console.log('[AI-Vision] AI tidak memberikan response JSON yang valid.');
        break;
      }

      const decision: AIModalDecision = JSON.parse(cleanJsonMatch[0]);

      if (!decision.hasModal) {
        console.log(`[AI-Vision] Layar bersih: ${decision.description || 'Tidak ada popup terdeteksi.'}`);
        return true;
      }

      console.log(`[AI-Vision] Popup terdeteksi oleh AI: ${decision.description}`);

      let clicked = false;

      // Try clicking by button text if provided
      if (decision.buttonText && decision.buttonText.trim().length > 0) {
        const textTarget = decision.buttonText.trim();
        console.log(`[AI-Vision] Mencoba klik tombol berdasarkan teks: "${textTarget}"`);
        const btn = page
          .locator('.eds-modal:visible button, .eds-modal:visible [role="button"], [class*="modal"]:visible button, [class*="guide"]:visible button')
          .filter({ hasText: new RegExp(textTarget, 'i') })
          .first();

        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click({ force: true, timeout: 2500 }).catch(() => {});
          await btn.dispatchEvent('click').catch(() => {});
          clicked = true;
          console.log(`[✓] Berhasil klik tombol "${textTarget}".`);
        }
      }

      // Try clicking by close icon selector if detected as close icon
      if (!clicked && decision.isCloseIcon) {
        console.log('[AI-Vision] Mencoba klik ikon close/exit modal (X)...');
        const closeBtn = page
          .locator(
            '.eds-modal:visible i.eds-modal__close, ' +
            '.eds-modal:visible button.eds-modal__header-close-btn, ' +
            '.eds-modal:visible [aria-label="Close"], ' +
            '[class*="modal"]:visible [class*="close"], ' +
            'i.eds-icon.eds-modal__close'
          )
          .first();

        if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await closeBtn.click({ force: true, timeout: 2500 }).catch(() => {});
          await closeBtn.dispatchEvent('click').catch(() => {});
          clicked = true;
          console.log('[✓] Berhasil klik ikon close modal.');
        }
      }

      // Fallback: Click using coordinates predicted by AI Vision
      if (!clicked && decision.xPercent !== undefined && decision.yPercent !== undefined) {
        const viewport = page.viewportSize() || { width: 1440, height: 900 };
        const clickX = Math.round((decision.xPercent / 100) * viewport.width);
        const clickY = Math.round((decision.yPercent / 100) * viewport.height);

        console.log(`[AI-Vision] Mencoba klik koordinat visual AI di (${clickX}, ${clickY})...`);
        await page.mouse.click(clickX, clickY).catch(() => {});
        clicked = true;
      }

      if (clicked) {
        await page.waitForTimeout(1500);
      } else {
        // Fallback: send Escape key
        console.log('[AI-Vision] Menekan Escape sebagai fallback...');
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(1000);
      }
    } catch (err) {
      console.warn(`[AI-Vision] Warning: Gagal memproses AI Vision: ${(err as Error).message}`);
      break;
    }
  }

  return true;
}
