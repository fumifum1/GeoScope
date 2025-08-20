class GeoScopeApp {
    // 定数をクラスの静的プロパティとして定義
    static DEFAULT_COORDS = [35.6895, 139.6917]; // 東京都庁の座標
    static DEFAULT_ZOOM = 15;
    static FILENAME_REGEX = /_(-?\d+\.\d+)_(-?\d+\.\d+)\.(png|jpg|jpeg)$/i;
    static TILE_LAYER_DEFINITIONS = {
        'Dark': {
            url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            options: {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }
        },
        'Standard': {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            options: {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }
        },
        'Satellite': {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            options: {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            }
        }
    };

    constructor() {
        // DOM要素をまとめて管理
        this.elements = {
            welcomeScreen: document.getElementById('welcome-screen'),
            mainContent: document.getElementById('main-content'),
            geolocationButton: document.getElementById('use-geolocation'),
            defaultLocationButton: document.getElementById('use-default-location'),
            inputCoordsContainer: document.getElementById('input-coords-container'),
            latInput: document.getElementById('latInput'),
            lngInput: document.getElementById('lngInput'),
            submitCoordsButton: document.getElementById('submitCoords'),
            mapContainer: document.getElementById('map'),
            thumbnailsContainer: document.getElementById('thumbnails'),
            fileInput: document.getElementById('fileInput'),
            hamburgerMenu: document.getElementById('hamburger-menu'),
            navMenu: document.getElementById('nav-menu'),
            overlay: document.getElementById('overlay'),
        };

        // アプリケーションの状態を管理
        this.map = null;
        this.markers = new Map();

        // thisのコンテキストを束縛
        this._handleGeolocation = this._handleGeolocation.bind(this);
        this._handleCustomLocation = this._handleCustomLocation.bind(this);
        this._handleFileSelect = this._handleFileSelect.bind(this);
    }

    /**
     * アプリケーションを初期化
     */
    init() {
        this._setupWelcomeScreenListeners();
        this._setupNavMenuListeners();
    }

    /**
     * ウェルカム画面のイベントリスナーを設定
     */
    _setupWelcomeScreenListeners() {
        this.elements.geolocationButton.addEventListener('click', this._handleGeolocation);

        this.elements.defaultLocationButton.addEventListener('click', () => {
            this.elements.inputCoordsContainer.style.display = 'block';
            this.elements.defaultLocationButton.style.display = 'none';
        });

        this.elements.submitCoordsButton.addEventListener('click', this._handleCustomLocation);
    }

    /**
     * ナビゲーションメニューのイベントリスナーを設定
     */
    _setupNavMenuListeners() {
        const toggleMenu = () => {
            this.elements.hamburgerMenu.classList.toggle('active');
            this.elements.navMenu.classList.toggle('active');
            this.elements.overlay.classList.toggle('active');
        };

        this.elements.hamburgerMenu.addEventListener('click', toggleMenu);
        this.elements.overlay.addEventListener('click', toggleMenu);

        // メニュー内のリンクをクリックしたときもメニューを閉じる
        this.elements.navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                // 外部リンクの場合は閉じないようにするなどの制御も可能
                toggleMenu();
            });
        });
    }

    /**
     * 現在地情報を使って地図を初期化
     */
    _handleGeolocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    this._initializeMap([latitude, longitude], GeoScopeApp.DEFAULT_ZOOM);
                },
                (error) => {
                    console.warn('現在地の取得に失敗しました。デフォルトの座標を使用します。', error);
                    this._initializeMap(GeoScopeApp.DEFAULT_COORDS, GeoScopeApp.DEFAULT_ZOOM);
                }
            );
        } else {
            console.warn('お使いのブラウザは現在地取得をサポートしていません。デフォルトの座標を使用します。');
            this._initializeMap(GeoScopeApp.DEFAULT_COORDS, GeoScopeApp.DEFAULT_ZOOM);
        }
    }

    /**
     * ユーザー入力の座標を使って地図を初期化
     */
    _handleCustomLocation() {
        const lat = parseFloat(this.elements.latInput.value);
        const lng = parseFloat(this.elements.lngInput.value);

        if (!isNaN(lat) && !isNaN(lng)) {
            this._initializeMap([lat, lng], GeoScopeApp.DEFAULT_ZOOM);
        } else {
            alert('有効な座標を入力してください。');
        }
    }

    /**
     * 地図のセットアップと画面遷移を行う
     * @param {number[]} center - 地図の中心座標 [lat, lng]
     * @param {number} zoom - 地図のズームレベル
     */
    _initializeMap(center, zoom) {
        this.elements.welcomeScreen.style.display = 'none';
        this.elements.mainContent.style.display = 'block';

        this.map = L.map(this.elements.mapContainer).setView(center, zoom);

        // 複数のタイルレイヤーを準備
        const baseLayers = {};
        for (const name in GeoScopeApp.TILE_LAYER_DEFINITIONS) {
            const def = GeoScopeApp.TILE_LAYER_DEFINITIONS[name];
            baseLayers[name] = L.tileLayer(def.url, def.options);
        }

        // デフォルトのレイヤーを地図に追加
        baseLayers['Standard'].addTo(this.map);

        // レイヤーコントロールを地図に追加
        L.control.layers(baseLayers).addTo(this.map);

        this.elements.fileInput.addEventListener('change', this._handleFileSelect);
    }

    /**
     * ファイル選択イベントを処理
     * @param {Event} event - changeイベントオブジェクト
     */
    async _handleFileSelect(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        for (const file of files) {
            if (this.markers.has(file.name)) continue; // 重複ファイルをスキップ
            await this._processFile(file);
        }
    }

    /**
     * 個別のファイルを処理
     * @param {File} file - 処理対象のファイルオブジェクト
     */
    async _processFile(file) {
        const coords = await this._getCoordsFromFile(file);
        if (!coords) {
            console.warn(`Coordinates not found in EXIF or filename for: ${file.name}`);
            return;
        }

        try {
            const dataUrl = await this._readFileAsDataURL(file);
            this._addPhotoToMap(file.name, coords, dataUrl);
        } catch (error) {
            console.error(`Error reading file: ${file.name}`, error);
        }
    }

    /**
     * EXIFまたはファイル名から座標を取得する
     * @param {File} file - 処理対象のファイルオブジェクト
     * @returns {Promise<number[]|null>} 座標 [lat, lng] または null
     */
    async _getCoordsFromFile(file) {
        // 1. EXIFから座標の取得を試みる
        try {
            // exifrライブラリはグローバルスコープに存在する
            const exif = await exifr.parse(file);
            if (exif && typeof exif.latitude === 'number' && typeof exif.longitude === 'number') {
                console.log(`Found EXIF coordinates for ${file.name}: [${exif.latitude}, ${exif.longitude}]`);
                return [exif.latitude, exif.longitude];
            }
        } catch (error) {
            // EXIFが読み取れないファイルは多いので、エラーではなく警告として扱う
            console.warn(`Could not parse EXIF data for ${file.name}. It may not contain EXIF data.`);
        }

        // 2. EXIFに座標がない場合、ファイル名から取得を試みる (フォールバック)
        const coordsFromName = this._parseCoordsFromFilename(file.name);
        if (coordsFromName) {
            console.log(`Falling back to filename coordinates for ${file.name}`);
            return coordsFromName;
        }

        return null;
    }

    /**
     * ファイル名から座標を抽出
     * @param {string} filename - ファイル名
     * @returns {number[]|null} 座標 [lat, lng] または null
     */
    _parseCoordsFromFilename(filename) {
        const match = filename.match(GeoScopeApp.FILENAME_REGEX);
        if (match) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
        }
        return null;
    }

    /**
     * FileReaderをPromiseでラップ
     * @param {File} file - 読み込むファイル
     * @returns {Promise<string>} Data URLを解決するPromise
     */
    _readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    /**
     * 写真を地図とサムネイルに追加
     * @param {string} filename - ファイル名
     * @param {number[]} coords - 座標 [lat, lng]
     * @param {string} dataUrl - 画像のData URL
     */
    _addPhotoToMap(filename, coords, dataUrl) {
        const marker = L.marker(coords).addTo(this.map);
        marker.bindPopup(`<b>${filename}</b><br><img src="${dataUrl}" style="width:200px; height:auto;"/>`);

        const thumbnailItem = this._createThumbnail(filename, coords, dataUrl, marker);

        this.markers.set(filename, marker);
        this.elements.thumbnailsContainer.appendChild(thumbnailItem);
    }

    /**
     * サムネイル要素を作成
     * @param {string} filename - ファイル名
     * @param {number[]} coords - 座標 [lat, lng]
     * @param {string} dataUrl - 画像のData URL
     * @param {L.Marker} marker - 対応するマーカー
     * @returns {HTMLElement} 作成されたサムネイル要素
     */
    _createThumbnail(filename, coords, dataUrl, marker) {
        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = 'thumbnail-item';

        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = filename;

        const text = document.createElement('p');
        text.textContent = filename;

        thumbnailItem.appendChild(img);
        thumbnailItem.appendChild(text);

        thumbnailItem.addEventListener('click', () => {
            this.map.flyTo(coords, GeoScopeApp.DEFAULT_ZOOM);
            marker.openPopup();
        });

        return thumbnailItem;
    }
}

// DOMが読み込まれたらアプリケーションを起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new GeoScopeApp();
    app.init();
});