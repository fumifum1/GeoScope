document.addEventListener('DOMContentLoaded', (event) => {
  // --- 定数定義 ---
  const CONSTANTS = {
    STORAGE_KEYS: {
      FILE_NAME: 'quickShotFileName',
      LOCATION_NAME: 'quickShotLocationName',
      MEMO_TEXT: 'quickShotMemoText',
    },
    DEFAULT_FILENAME: '記録写真',
    CSS_ACTIVE: 'active',
    CSS_FULLSCREEN: 'fullscreen',
  };

  // --- DOM要素 ---
  const DOM = {
    startScreen: document.getElementById('start-screen'),
    cameraScreen: document.getElementById('camera-screen'),
    switchCameraButton: document.getElementById('switchCameraButton'),
    zoomSlider: document.getElementById('zoom-slider'),
    startButton: document.getElementById('startButton'),
    stopButton: document.getElementById('stopButton'),
    menuToggle: document.getElementById('menu-toggle'),
    menuOverlay: document.getElementById('menu-overlay'),
    menuContainer: document.getElementById('menu-container'),
    video: document.getElementById('video'),
    canvas: document.getElementById('canvas'),
    overlayButton: document.getElementById('overlayButton'),
    fileNameInput: document.getElementById('fileName'),
    locationNameInput: document.getElementById('locationName'),
    memoTextInput: document.getElementById('memoText'),
    photoSizeSelect: document.getElementById('photoSize'),
    showInfoCheckbox: document.getElementById('showInfo'),
    showCoordsCheckbox: document.getElementById('showCoords'),
    statusElement: document.getElementById('status'),
    counterElement: document.getElementById('counter'),
  };
  const context = DOM.canvas.getContext('2d');

  // --- アプリケーションの状態 ---
  const state = {
    stream: null,
    coords: { lat: null, lon: null },
    shotCount: 0,
    currentFacingMode: 'environment', // 'environment' or 'user'
    lastCaptureDataUrl: null, // 撮影した画像のDataURLを一時保存
  };

  // --- UI関連の処理 ---
  const UI = {
    showScreen(screenName) {
      DOM.startScreen.classList.remove(CONSTANTS.CSS_ACTIVE);
      DOM.cameraScreen.classList.remove(CONSTANTS.CSS_ACTIVE);
      if (screenName === 'start') {
        DOM.startScreen.classList.add(CONSTANTS.CSS_ACTIVE);
      } else if (screenName === 'camera') {
        DOM.cameraScreen.classList.add(CONSTANTS.CSS_ACTIVE);
      }
    },
    toggleCameraControls(show) {
      const display = show ? 'block' : 'none';
      DOM.video.style.display = display;
      DOM.overlayButton.style.display = display;
      DOM.menuToggle.style.display = display;
      DOM.stopButton.style.display = show ? 'flex' : 'none';
      DOM.cameraScreen.classList.toggle(CONSTANTS.CSS_FULLSCREEN, show);
      DOM.switchCameraButton.style.display = show ? 'flex' : 'none';
      if (!show) {
        DOM.zoomSlider.style.display = 'none'; // カメラ停止時にスライダーを隠す
      }
    },
    toggleMenu(show) {
      DOM.menuOverlay.classList.toggle(CONSTANTS.CSS_ACTIVE, show);
      const display = show ? 'none' : 'block';
      // メニュー表示中は背後のステータスとカウンターを非表示にする
      DOM.statusElement.style.display = display;
      DOM.counterElement.style.display = display;
    },
    updateStatus(text) {
      DOM.statusElement.textContent = text;
    },
    appendStatus(text) {
      DOM.statusElement.textContent += text;
    },
    updateCounter() {
      const counterText = `現在の撮影回数: ${state.shotCount}`;
      DOM.counterElement.textContent = counterText;
    },
    resetCounter() {
      state.shotCount = 0;
      DOM.counterElement.textContent = '';
    },
    createPermissionDialog() {
      if (document.getElementById('location-permission-dialog')) return;

      const dialogHTML = `
        <div id="location-permission-dialog" class="permission-dialog">
            <div class="permission-dialog-content">
                <h3>位置情報の利用について</h3>
                <p>撮影した写真に正確な位置情報を記録するために、現在地の利用許可をお願いします。</p>
                <p class="dialog-note">この情報は写真のファイル名や画像内の情報として利用されます。</p>
                <div class="permission-dialog-buttons">
                    <button id="permission-deny-btn" class="dialog-btn deny">あとで</button>
                    <button id="permission-allow-btn" class="dialog-btn allow">許可する</button>
                </div>
            </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', dialogHTML);

      const style = document.createElement('style');
      style.textContent = `
        .permission-dialog {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            display: none; justify-content: center; align-items: center;
            z-index: 1000;
        }
        .permission-dialog-content {
            background-color: #fff; padding: 24px; border-radius: 8px;
            text-align: center; max-width: 90%; width: 340px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .permission-dialog-content h3 { margin-top: 0; color: #333; }
        .permission-dialog-content p { color: #555; font-size: 14px; line-height: 1.6; margin-bottom: 8px; }
        .permission-dialog-content .dialog-note { font-size: 12px; color: #777; }
        .permission-dialog-buttons { margin-top: 24px; display: flex; justify-content: space-around; }
        .dialog-btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; min-width: 100px; }
        .dialog-btn.deny { background-color: #f0f0f0; color: #333; }
        .dialog-btn.allow { background-color: #007bff; color: #fff; }
      `;
      document.head.appendChild(style);
    },
    handlePermissionChoice() {
      return new Promise((resolve) => {
        const dialog = document.getElementById('location-permission-dialog');
        const allowBtn = document.getElementById('permission-allow-btn');
        const denyBtn = document.getElementById('permission-deny-btn');

        if (!dialog || !allowBtn || !denyBtn) return resolve(true); // ダイアログがない場合は通常フロー

        const listener = (e) => {
          dialog.style.display = 'none';
          allowBtn.removeEventListener('click', listener);
          denyBtn.removeEventListener('click', listener);
          resolve(e.target.id === 'permission-allow-btn');
        };

        allowBtn.addEventListener('click', listener);
        denyBtn.addEventListener('click', listener);
        dialog.style.display = 'flex';
      });
    },
  };

  // --- LocalStorage関連の処理 ---
  const Storage = {
    loadInputs() {
      DOM.fileNameInput.value = localStorage.getItem(CONSTANTS.STORAGE_KEYS.FILE_NAME) || '';
      DOM.locationNameInput.value = localStorage.getItem(CONSTANTS.STORAGE_KEYS.LOCATION_NAME) || '';
      DOM.memoTextInput.value = localStorage.getItem(CONSTANTS.STORAGE_KEYS.MEMO_TEXT) || '';
    },
    saveInput(key, value) {
      localStorage.setItem(key, value);
    }
  };

  // --- カメラ・位置情報関連の処理 ---
  const Device = {
    async startCamera() {
      const [videoWidth, videoHeight] = DOM.photoSizeSelect.value.split('x').map(Number);
      try {
        // 既存のストリームがあれば停止
        if (state.stream) {
          this.stopCamera();
        }
        state.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: state.currentFacingMode },
            width: { ideal: videoWidth },
            height: { ideal: videoHeight }
          }
        });
        DOM.video.srcObject = state.stream;

        // 映像のメタデータが読み込まれるまで待機し、準備が完了してから次に進む
        await new Promise((resolve, reject) => {
          DOM.video.onloadedmetadata = () => resolve();
          // タイムアウト処理を追加して、無限に待機するのを防ぐ
          setTimeout(() => reject(new Error('カメラ映像の読み込みがタイムアウトしました。')), 10000);
        });

        await this.setupZoom(); // ストリーム開始後にズームを設定
        UI.updateStatus(`カメラが起動しました。(${videoWidth}x${videoHeight})`);
      } catch (err) {
        console.error('Error accessing camera: ', err);
        throw new Error(err.message || 'カメラの起動に失敗しました。');
      }
    },
    stopCamera() {
      if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
      }
      DOM.video.srcObject = null;
    },
    async getLocation() {
      if (!navigator.geolocation) {
        UI.appendStatus(' (位置情報機能はサポートされていません)');
        return;
      }

      const userAllowed = await UI.handlePermissionChoice();

      if (userAllowed) {
        UI.updateStatus('位置情報を取得しています...');
        await this.requestGeolocation();
      } else {
        UI.appendStatus(' (位置情報は利用しません)');
      }
    },
    async switchCamera() {
      state.currentFacingMode = state.currentFacingMode === 'environment' ? 'user' : 'environment';
      UI.updateStatus('カメラを切り替えています...');
      try {
        await this.startCamera();
      } catch (error) {
        UI.updateStatus(`⛔ カメラの切り替えに失敗しました: ${error.message}`);
        // 失敗した場合は元のモードに戻す
        state.currentFacingMode = state.currentFacingMode === 'environment' ? 'user' : 'environment';
      }
    },
    async setupZoom() {
      if (!state.stream) return;
      const [videoTrack] = state.stream.getVideoTracks();
      const capabilities = videoTrack.getCapabilities();

      if (capabilities.zoom) {
        DOM.zoomSlider.min = capabilities.zoom.min;
        DOM.zoomSlider.max = capabilities.zoom.max;
        DOM.zoomSlider.step = capabilities.zoom.step;
        DOM.zoomSlider.value = videoTrack.getSettings().zoom || capabilities.zoom.min;
        DOM.zoomSlider.style.display = 'block';
      } else {
        DOM.zoomSlider.style.display = 'none';
        console.log('Zoom is not supported by this device/track.');
      }
    },
    async applyZoom(value) {
      if (!state.stream) return;
      const [videoTrack] = state.stream.getVideoTracks();
      try {
        await videoTrack.applyConstraints({
          advanced: [{ zoom: parseFloat(value) }]
        });
      } catch (err) {
        console.error('Error applying zoom:', err);
      }
    },
    requestGeolocation() {
      return new Promise((resolve) => {
        const geoOptions = {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 60000
        };

        navigator.geolocation.getCurrentPosition(
          (position) => {
            state.coords.lat = position.coords.latitude;
            state.coords.lon = position.coords.longitude;
            UI.appendStatus(' (位置情報取得済み ✅)');
            resolve();
          },
          (error) => {
            console.error('Geolocation error: ', error);
            let errorMessage = ' (位置情報取得失敗: ';
            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorMessage += '許可されませんでした)';
                alert('位置情報の使用がブラウザまたはOSレベルでブロックされています。設定を確認してください。');
                break;
              case error.POSITION_UNAVAILABLE:
                errorMessage += '位置を特定できません)';
                break;
              case error.TIMEOUT:
                errorMessage += 'タイムアウトしました)';
                break;
              default:
                errorMessage += '不明なエラー)';
                break;
            }
            UI.appendStatus(errorMessage);
            resolve(); // エラーでも処理を続行
          },
          geoOptions
        );
      });
    }
  };

  // --- 画像処理・ファイル生成 ---
  const ImageProcessor = {
    captureAndDrawImage() {
      const [canvasWidth, photoHeight] = DOM.photoSizeSelect.value.split('x').map(Number);
      const infoHeight = DOM.showInfoCheckbox.checked ? 60 : 0;
      const canvasHeight = photoHeight + infoHeight;

      DOM.canvas.width = canvasWidth;
      DOM.canvas.height = canvasHeight;

      const videoAspectRatio = DOM.video.videoWidth / DOM.video.videoHeight;
      const canvasAspectRatio = canvasWidth / photoHeight;
      let sx, sy, sWidth, sHeight;

      if (videoAspectRatio > canvasAspectRatio) {
        sWidth = DOM.video.videoHeight * canvasAspectRatio;
        sHeight = DOM.video.videoHeight;
        sx = (DOM.video.videoWidth - sWidth) / 2;
        sy = 0;
      } else {
        sWidth = DOM.video.videoWidth;
        sHeight = DOM.video.videoWidth / canvasAspectRatio;
        sx = 0;
        sy = (DOM.video.videoHeight - sHeight) / 2;
      }
      context.drawImage(DOM.video, sx, sy, sWidth, sHeight, 0, 0, canvasWidth, photoHeight);

      if (DOM.showInfoCheckbox.checked) {
        this.drawInfoOverlay(canvasWidth, photoHeight, infoHeight);
      }
    },

    drawInfoOverlay(canvasWidth, photoHeight, infoHeight) {
      context.fillStyle = '#fff';
      context.fillRect(0, photoHeight, canvasWidth, infoHeight);
      context.fillStyle = '#000';
      context.font = '12px Arial';
      context.textAlign = 'left';

      const padding = 10;
      const lineHeight = 15;
      const fileNameBase = DOM.fileNameInput.value || CONSTANTS.DEFAULT_FILENAME;
      const locationName = DOM.locationNameInput.value || '未入力場所';
      const now = new Date();
      const dateTimeStr = now.toLocaleString('ja-JP');

      let yPos = photoHeight + lineHeight;
      context.fillText(`ファイル名: ${fileNameBase}  場所: ${locationName}`, padding, yPos);

      yPos += lineHeight;
      let line2Text = `日時: ${dateTimeStr}`;

      if (DOM.showCoordsCheckbox.checked) {
        const latStr = state.coords.lat ? `緯度: ${state.coords.lat.toFixed(6)}` : '緯度: -';
        const lonStr = state.coords.lon ? `経度: ${state.coords.lon.toFixed(6)}` : '経度: -';
        line2Text += `  ${latStr}, ${lonStr}`;
      }
      context.fillText(line2Text, padding, yPos);

      yPos += lineHeight;
      context.fillText(`メモ: ${DOM.memoTextInput.value || 'メモなし'}`, padding, yPos);
    },

    generateFileName() {
      const fileNameBase = DOM.fileNameInput.value || CONSTANTS.DEFAULT_FILENAME;
      let fullFileName = `${fileNameBase}_${String(state.shotCount).padStart(2, '0')}`;

      if (DOM.showInfoCheckbox.checked) {
        const locationName = DOM.locationNameInput.value ? `_${DOM.locationNameInput.value}` : '';
        const now = new Date();
        const dateTimeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

        let coordsStr = '';
        if (DOM.showCoordsCheckbox.checked) {
          coordsStr = state.coords.lat ? `_${state.coords.lat.toFixed(6)}` : '_緯度不明';
          coordsStr += state.coords.lon ? `_${state.coords.lon.toFixed(6)}` : '_経度不明';
        }
        fullFileName = `${fileNameBase}_${String(state.shotCount).padStart(2, '0')}${locationName}_${dateTimeStr}${coordsStr}`;
      }
      return `${fullFileName}.png`;
    },
  };

  // --- イベントハンドラ ---
  const Handlers = {
    async handleStartClick() {
      UI.showScreen('camera');
      UI.toggleCameraControls(true);
      UI.updateStatus('カメラと位置情報の許可を求めています...');

      try {
        state.currentFacingMode = 'environment'; // 常に背面カメラから開始
        await Device.startCamera();
        await Device.getLocation();
        state.shotCount = 0;
        UI.updateCounter();
      } catch (error) {
        UI.updateStatus(`⛔ ${error.message}`);
        Device.stopCamera();
        UI.toggleCameraControls(false);
        UI.showScreen('start');
      }
    },

    handleStopClick() {
      Device.stopCamera();
      state.currentFacingMode = 'environment'; // 停止時にリセット
      UI.toggleCameraControls(false);
      UI.showScreen('start');
      UI.updateStatus('カメラを停止しました。');
      UI.resetCounter();
    },

    handleMenuToggleClick() {
      const isActive = DOM.menuOverlay.classList.contains(CONSTANTS.CSS_ACTIVE);
      UI.toggleMenu(!isActive);
    },

    handleMenuOverlayClick(e) {
      if (e.target.id === 'menu-overlay') {
        UI.toggleMenu(false);
      }
    },

    handleCaptureClick() {
      // カメラ映像の準備ができる前にボタンが押された場合のエラーを防止
      if (!DOM.video.videoWidth || !DOM.video.videoHeight) {
        UI.updateStatus('⛔ カメラの準備ができていません。少し待ってから再試行してください。');
        console.warn('Capture attempted before video dimensions were available.');
        return;
      }

      // 画像をキャプチャしてメインのcanvasに描画
      ImageProcessor.captureAndDrawImage();

      // カウンターを更新
      state.shotCount++;
      UI.updateCounter();

      // ファイル名を生成し、画像をダウンロード
      const fileName = ImageProcessor.generateFileName();
      const imageDataUrl = DOM.canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = fileName;
      link.href = imageDataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // ステータスを更新 (画面はカメラのまま)
      UI.updateStatus(`保存しました。(${fileName})`);
    },

    setupEventListeners() {
      DOM.startButton.addEventListener('click', this.handleStartClick);
      DOM.stopButton.addEventListener('click', this.handleStopClick);
      DOM.overlayButton.addEventListener('click', this.handleCaptureClick);
      DOM.menuToggle.addEventListener('click', this.handleMenuToggleClick);
      DOM.menuOverlay.addEventListener('click', this.handleMenuOverlayClick);
      DOM.menuContainer.addEventListener('click', (e) => e.stopPropagation());

      DOM.switchCameraButton.addEventListener('click', () => Device.switchCamera());
      DOM.zoomSlider.addEventListener('input', (e) => Device.applyZoom(e.target.value));

      DOM.fileNameInput.addEventListener('input', () => Storage.saveInput(CONSTANTS.STORAGE_KEYS.FILE_NAME, DOM.fileNameInput.value));
      DOM.locationNameInput.addEventListener('input', () => Storage.saveInput(CONSTANTS.STORAGE_KEYS.LOCATION_NAME, DOM.locationNameInput.value));
      DOM.memoTextInput.addEventListener('input', () => Storage.saveInput(CONSTANTS.STORAGE_KEYS.MEMO_TEXT, DOM.memoTextInput.value));
    }
  };

  // --- アプリケーション初期化 ---
  function init() {
    UI.createPermissionDialog();
    UI.showScreen('start');
    Storage.loadInputs();
    Handlers.setupEventListeners();
  }

  init();
});