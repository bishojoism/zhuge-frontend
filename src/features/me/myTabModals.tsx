// ===== 我的 tab 快捷入口弹窗：/private（我的滴滴）与 /my（我的主题）以弹窗打开 =====
// 页面组件复用（数据/列表/跳转逻辑不变）；弹窗内滚动 + 隐藏页面自带的"← 返回"按钮
//（首个子 Button，CSS .me-page-modal > button:first-child 隐藏；路由页场景不受影响）。
import PrivatePage from '../private/PrivatePage';
import MyTopicsPage from '../my/MyTopicsPage';
import { openModalOnce } from '../../lib/modals';

export function openMyPrivateModal(): void {
  openModalOnce('my-private', (m) => {
    m.open({
      modalId: 'my-private',
      size: 480,
      children: (
        <div className="me-page-modal">
          <PrivatePage />
        </div>
      ),
    });
  });
}

export function openMyTopicsModal(): void {
  openModalOnce('my-topics', (m) => {
    m.open({
      modalId: 'my-topics',
      size: 480,
      children: (
        <div className="me-page-modal">
          <MyTopicsPage />
        </div>
      ),
    });
  });
}
