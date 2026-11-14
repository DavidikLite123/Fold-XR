import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  createSpatialButton,
  createWindowHeader,
  placeObjectInFrontOfCamera,
  SpatialWindowController,
  type SpatialAppInstance,
} from '../../os/SpatialWindow';
import {computeWindowArcSlot} from '../../os/SpatialOSState';
import {soundFX} from '../../utils/SoundFX';

interface CityPreset {
  name: string;
  lat: number;
  lon: number;
  tz: string;
}

const CITIES: readonly CityPreset[] = [
  {name: 'Москва', lat: 55.7558, lon: 37.6173, tz: 'Europe/Moscow'},
  {name: 'Сеул', lat: 37.5665, lon: 126.978, tz: 'Asia/Seoul'},
  {name: 'Токио', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo'},
  {name: 'Сан-Франциско', lat: 37.7749, lon: -122.4194, tz: 'America/Los_Angeles'},
];

export class ClockWeatherApp extends xb.Script implements SpatialAppInstance {
  readonly appId = 'weather-clock';
  private card: xb.UICard;
  private windowController: SpatialWindowController;
  private cityIndex = 0;
  private cityTitle: xb.UIText;
  private clockText: xb.UIText;
  private tempText: xb.UIText;
  private detailsText: xb.UIText;
  private lastTickSecond = -1;
  private onCloseCallback: () => void;

  constructor(onClose: () => void) {
    super();
    this.onCloseCallback = onClose;

    this.cityTitle = new xb.UIText({
      text: 'Москва',
      style: {fontSize: 22, fontWeight: 'bold'},
    });
    this.clockText = new xb.UIText({
      text: '--:--:--',
      style: {fontSize: 40, fontWeight: 'bold', color: '#7dd3fc'},
    });
    this.tempText = new xb.UIText({
      text: 'Загрузка погоды...',
      style: {fontSize: 22, fontWeight: 'bold'},
    });
    this.detailsText = new xb.UIText({
      text: 'Open-Meteo Live API',
      style: {fontSize: 15, opacity: 0.78, whiteSpace: 'pre-line'},
    });

    const cityBar = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: CITIES.map(
        (city, idx) =>
          createSpatialButton({
            label: city.name,
            fontSize: 13,
            style: {
              flexGrow: 1,
              height: 36,
              borderRadius: 14,
              paddingLeft: 8,
              paddingRight: 8,
            },
            onClick: () => {
              soundFX.playTap();
              this.cityIndex = idx;
              this.updateClock(true);
              void this.fetchWeather();
            },
          }).button
      ),
    });

    this.card = new xb.UICard({
      size: {width: 0.56, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
        padding: 16,
      },
      children: [],
    });
    this.windowController = new SpatialWindowController(this.card);

    const header = createWindowHeader({
      title: 'Погода и Время',
      icon: 'wb_sunny',
      accentColor: '#0ea5e9',
      controller: this.windowController,
      onRecenter: () => this.recenter(xb.core.camera),
      onClose: () => this.onCloseCallback(),
    });

    this.card.add(
      header,
      cityBar,
      new xb.UIPanel({
        style: {
          width: '100%',
          padding: 14,
          borderRadius: 18,
          backgroundColor: 'rgba(10, 18, 34, 0.56)',
          flexDirection: 'column',
          gap: 8,
        },
        children: [
          this.cityTitle,
          this.clockText,
          this.tempText,
          this.detailsText,
        ],
      })
    );
    this.card.name = 'Weather & Clock window';
    this.add(this.card);
  }

  init(): void {
    this.recenter(xb.core.camera, 3);
    this.updateClock(true);
    void this.fetchWeather();
  }

  getWindowController(): SpatialWindowController {
    return this.windowController;
  }

  recenter(camera: THREE.Camera, slotIndex = 3): void {
    const slot = computeWindowArcSlot(slotIndex);
    placeObjectInFrontOfCamera(this.card, camera, {
      distance: slot.distance,
      angleRad: slot.angleRad,
      heightOffset: slot.heightOffset,
    });
    this.windowController.refreshAfterRecenter(camera);
  }

  dispose(): void {
    this.windowController.dispose();
  }

  update(): void {
    this.updateClock(false);
  }

  private updateClock(force: boolean): void {
    const now = new Date();
    const sec = now.getSeconds();
    if (!force && sec === this.lastTickSecond) return;
    this.lastTickSecond = sec;

    const city = CITIES[this.cityIndex];
    this.cityTitle.text = city.name;
    try {
      this.clockText.text = new Intl.DateTimeFormat('ru-RU', {
        timeZone: city.tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(now);
    } catch {
      this.clockText.text = now.toTimeString().slice(0, 8);
    }
  }

  private async fetchWeather(): Promise<void> {
    const city = CITIES[this.cityIndex];
    this.tempText.text = 'Обновление...';
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        current?: {
          temperature_2m?: number;
          wind_speed_10m?: number;
          relative_humidity_2m?: number;
        };
      };
      const t = data.current?.temperature_2m;
      const wind = data.current?.wind_speed_10m;
      const hum = data.current?.relative_humidity_2m;
      this.tempText.text = `${t !== undefined ? Math.round(t) : '--'}°C`;
      this.detailsText.text = `Ветер: ${wind ?? '--'} км/ч  •  Влажность: ${hum ?? '--'}%\nДанные Open-Meteo Live`;
    } catch {
      this.tempText.text = '18°C (офлайн-превью)';
      this.detailsText.text =
        'Ветер: 11 км/ч  •  Влажность: 54%\nНе удалось подключиться к Open-Meteo.';
    }
  }
}
