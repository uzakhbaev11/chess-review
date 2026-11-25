// Web Worker, в котором крутится локальная модель (WebLLM + WebGPU),
// чтобы интерфейс не подвисал во время генерации.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
