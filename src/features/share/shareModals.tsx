// ===== 精美海报分享弹窗 =====
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Group, Loader } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { openModalOnce } from '../../lib/modals';
import { copyText } from '../../lib/utils';
import { useAuth } from '../auth/AuthContext';
import { drawShareCard, TEMPLATES } from './poster';

export interface ShareData {
  id: number;
  title: string;
  content: string;
  imageUrl?: string | null;
  /** 作者：以角色发帖时为角色外貌/姓名/性别，否则为皮下信息 */
  author?: { name: string; avatarUrl?: string | null; gender?: string | null };
}

// 每个模板在缩略按钮上的示意色条（仅弹窗展示用，与 canvas 绘制逻辑无关）
const TPL_COLORS: Record<string, string> = {
  flow: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)',
  ink: 'linear-gradient(135deg,#faf6ec,#e8dcc0)',
  star: 'linear-gradient(135deg,#070b1f,#241040)',
  paper: 'linear-gradient(135deg,#fdf6ec,#e8b4b8)',
  neon: 'linear-gradient(135deg,#0a0a14,#10102a)',
  sakura: 'linear-gradient(135deg,#fdeef4,#f6d8e4)',
  mono: 'linear-gradient(135deg,#fafafa,#d9d9d9)',
  forest: 'linear-gradient(135deg,#0e2a1e,#0c2418)',
  ocean: 'linear-gradient(135deg,#0b3d5c,#08394f)',
  sunset: 'linear-gradient(135deg,#3a1c54,#f2a05e)',
  gold: 'linear-gradient(135deg,#1a1208,#2a1e0e)',
  candy: 'linear-gradient(135deg,#ffd9e8,#cfe4ff)',
};

/** 打开「精美海报」弹窗 */
export function openShareModal(d: ShareData): void {
  openModalOnce('share', (m) => {
    m.open({
      title: '精美海报',
      size: 520,
      centered: true,
      children: <ShareModalContent data={d} />,
    });
  });
}

function ShareModalContent({ data }: { data: ShareData }): JSX.Element {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawSeq = useRef(0);
  const [templateKey, setTemplateKey] = useState<string>(TEMPLATES[0].key);
  const [drawing, setDrawing] = useState(false);
  const [ready, setReady] = useState(false); // 首次绘制完成（canvas 已有内容）

  const draw = useCallback(
    async (key: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const seq = ++drawSeq.current;
      setDrawing(true);
      try {
        await drawShareCard(canvas, {
          title: data.title,
          content: data.content,
          imageUrl: data.imageUrl ?? null,
          templateId: key,
          author: data.author,
        });
        if (seq === drawSeq.current) setReady(true);
      } finally {
        if (seq === drawSeq.current) setDrawing(false);
      }
    },
    [data]
  );

  // 初次打开 + 切换模板即重绘
  useEffect(() => {
    void draw(templateKey);
  }, [draw, templateKey]);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        notifications.show({ color: 'red', message: '生成图片失败，请重试' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `主格-海报-${data.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const handleCopy = async () => {
    const ok = await copyText(
      `${window.location.origin}/d/${data.id}${user ? `?invite=${user.id}` : ''}`
    );
    notifications.show(
      ok
        ? { color: 'teal', message: '链接已复制' }
        : { color: 'red', message: '复制失败，请手动复制' }
    );
  };

  return (
    <div>
      <div className="share-tpl-row">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`share-tpl-btn${t.key === templateKey ? ' active' : ''}`}
            onClick={() => setTemplateKey(t.key)}
            disabled={drawing}
            style={{ cursor: 'pointer' }}
          >
            <span
              aria-hidden
              style={{
                display: 'block',
                height: 10,
                marginBottom: 5,
                borderRadius: 5,
                background: TPL_COLORS[t.key] || '#ccc',
              }}
            />
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      <div className="share-canvas-wrap" style={{ position: 'relative' }}>
        <canvas ref={canvasRef} />
        {drawing && !ready && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,.55)',
            }}
          >
            <Loader size="lg" />
          </div>
        )}
      </div>

      <div className="share-hint">长按图片可保存到相册</div>

      <Group grow mt="md">
        <Button loading={drawing} disabled={!ready} onClick={handleSave}>
          保存图片
        </Button>
        <Button variant="light" loading={drawing} onClick={handleCopy}>
          复制链接
        </Button>
      </Group>
    </div>
  );
}
