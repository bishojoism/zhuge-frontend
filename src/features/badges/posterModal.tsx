// ===== 邀请海报弹窗：邀请链接转竖版海报（头像 + 昵称 + 二维码 + 品牌），长按保存 =====
// canvas 绘制 → 显示 <img>，iOS 长按保存图片 / PC 下载按钮
import { useEffect, useRef, useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { api } from '../../api/client';
import { openModalOnce } from '../../lib/modals';
import useSWR from 'swr';
import { fetcher } from '../../api/hooks';
import type { CharacterItem } from '../../types';

export function openInvitePosterModal(userId: number, username: string): void {
  openModalOnce('invite-poster', (m) => {
    m.open({
      modalId: 'invite-poster',
      title: '邀请海报',
      centered: true,
      size: 'sm',
      children: <PosterContent userId={userId} username={username} />,
    });
  });
}

const W = 750;
const H = 1000;

function PosterContent({ userId, username }: { userId: number; username: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  // 第一个角色（有外貌图时画到海报上，更亲切）
  const { data: charsData } = useSWR<{ data: CharacterItem[] }>('/me/characters', fetcher);
  const char = (charsData?.data || []).find((c) => c.appearance) || (charsData?.data || [])[0];

  useEffect(() => {
    let alive = true;
    const link = `${window.location.origin}/?invite=${userId}`;
    const draw = async () => {
      try {
        const cvs = document.createElement('canvas');
        cvs.width = W;
        cvs.height = H;
        const ctx = cvs.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        // 背景渐变
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#2a3350');
        g.addColorStop(0.6, '#3b4468');
        g.addColorStop(1, '#232a3d');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // 装饰圆
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        ctx.beginPath(); ctx.arc(W - 60, 80, 150, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, H - 120, 120, 0, Math.PI * 2); ctx.fill();
        // 角色头像（圆形）
        if (char?.appearance) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = char.appearance;
          await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); });
          ctx.save();
          ctx.beginPath();
          ctx.arc(W / 2, 210, 78, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, W / 2 - 78, 210 - 78, 156, 156);
          ctx.restore();
          ctx.lineWidth = 6;
          ctx.strokeStyle = 'rgba(255,255,255,.85)';
          ctx.beginPath(); ctx.arc(W / 2, 210, 78, 0, Math.PI * 2); ctx.stroke();
        }
        // 标题
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = '700 64px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText('我在《主格》等你', W / 2, char?.appearance ? 380 : 260);
        // 用户名
        ctx.fillStyle = '#d8a05c';
        ctx.font = '600 40px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText(username, W / 2, char?.appearance ? 460 : 340);
        // 二维码
        const qrSize = 280;
        const qrCanvas = document.createElement('canvas');
        const { default: QRCode } = await import('qrcode');
        await QRCode.toCanvas(qrCanvas, link, { width: qrSize, margin: 1, color: { dark: '#232a3d', light: '#ffffff' } });
        const qx = (W - qrSize) / 2;
        const qy = char?.appearance ? 540 : 430;
        ctx.fillStyle = '#fff';
        ctx.fillRect(qx - 14, qy - 14, qrSize + 28, qrSize + 28);
        ctx.drawImage(qrCanvas, qx, qy, qrSize, qrSize);
        // 平台网址：中文域名显示（location.host 是 punycode；完整域名为 master.清冷仙子哦齁齁齁.xyz）
        const displayHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
          ? window.location.host
          : 'master.清冷仙子哦齁齁齁.xyz';
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.font = '28px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText(displayHost, W / 2, H - 60);
        // 标语
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText('开戏 · 接戏 · 滴滴私密对戏', W / 2, H - 24);
        if (alive) {
          canvasRef.current = cvs;
          setImgSrc(cvs.toDataURL('image/png'));
        }
      } catch {
        if (alive) setErr(true);
      }
    };
    void draw();
    return () => { alive = false; };
  }, [userId, username, char?.id, char?.appearance]);

  const download = () => {
    if (!imgSrc) return;
    const a = document.createElement('a');
    a.href = imgSrc;
    a.download = `zhuge-invite-${username}.png`;
    a.click();
  };

  return (
    <Stack gap="md" py="xs" align="center">
      {err ? (
        <Text size="sm" c="dimmed">
          海报生成失败，请重试
        </Text>
      ) : imgSrc ? (
        <>
          <img
            src={imgSrc}
            alt="邀请海报"
            style={{ width: '100%', maxWidth: 280, borderRadius: 14, boxShadow: '0 6px 24px rgba(0,0,0,.25)' }}
          />
          <Text size="xs" c="dimmed">
            长按图片保存，分享到 QQ 群 / 朋友圈
          </Text>
          <Group justify="center">
            <Button size="compact-sm" variant="default" onClick={download}>
              ⬇ 下载
            </Button>
            <Button size="compact-sm" variant="subtle" onClick={() => modals.closeAll()}>
              完成
            </Button>
          </Group>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          正在绘制海报…
        </Text>
      )}
    </Stack>
  );
}
