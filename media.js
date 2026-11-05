/* Local upload optimisation. Never enlarge a file or upload an unreadable conversion. */
(function () {
  'use strict';
  const cache = new WeakMap();
  const dimensions = (w,h,max) => { const ratio=Math.min(1,max/Math.max(w,h));return [Math.max(2,Math.round(w*ratio/2)*2),Math.max(2,Math.round(h*ratio/2)*2)]; };
  async function image(file,max=2560){
    const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
    try {
      const [w,h]=dimensions(bitmap.width,bitmap.height,max),canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bitmap,0,0,w,h);
      // PNG transparency is preserved; JPEG uses high quality for room detail and signs.
      const type=file.type==='image/png'?'image/webp':'image/jpeg';
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,.9));
      if(!blob || !blob.size)throw Error('圖片處理失敗，請重新選擇照片。');
      if(blob.size>=file.size)return file;
      return new File([blob],file.name.replace(/\.[^.]+$/,'')+(blob.type==='image/webp'?'.webp':'.jpg'),{type:blob.type});
    }finally{bitmap.close()}
  }
  async function video(file,onProgress=()=>{}){
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw Error('此瀏覽器不支援影片壓縮，請使用新版 Chrome，或填寫影片連結。');
    const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(x=>MediaRecorder.isTypeSupported(x));
    if(!mime)throw Error('目前瀏覽器無可用影片編碼，請改用新版 Chrome。');
    const url=URL.createObjectURL(file),v=document.createElement('video');v.src=url;v.playsInline=true;v.preload='auto';
    let audio,stream,recorder,timer,frame,source;
    try{
      await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=()=>reject(Error('影片格式無法讀取，請選擇 MP4 或 WebM。'));timer=setTimeout(()=>reject(Error('影片讀取逾時。')),15000)});clearTimeout(timer);
      if(!Number.isFinite(v.duration)||v.duration<=0||v.duration>600)throw Error('請上傳 10 分鐘以內影片，較長影片請填寫影片連結。');
      const [w,h]=dimensions(v.videoWidth,v.videoHeight,1920),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');stream=canvas.captureStream(30);
      // Route audio to the recorder, not the speaker; do not silently drop audio.
      const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw Error('此瀏覽器無法保留影片音訊，請改用新版 Chrome。');
      audio=new AudioCtx();await audio.resume();if(audio.state!=='running')throw Error('請先點擊影片播放，再重新上傳以啟用音訊處理。');
      source=audio.createMediaElementSource(v);const dest=audio.createMediaStreamDestination();source.connect(dest);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000,audioBitsPerSecond:128000});
      const chunks=[];
      const output=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onerror=()=>reject(Error('影片壓縮失敗，請重新選擇。'));recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}));v.onerror=()=>reject(Error('影片讀取中斷。'));timer=setTimeout(()=>reject(Error('影片壓縮逾時，請保持頁面在前景後重試。')),(v.duration+60)*1000)});
      const draw=()=>{ctx.drawImage(v,0,0,w,h);onProgress('影片壓縮中 '+Math.min(99,Math.round(v.currentTime/v.duration*100))+'%，請保持此頁開啟…');frame=requestAnimationFrame(draw)};
      v.onended=()=>{cancelAnimationFrame(frame);if(recorder.state==='recording')recorder.stop()};ctx.drawImage(v,0,0,w,h);recorder.start(1000);await v.play();draw();
      const blob=await output;
      if(!blob.size)throw Error('影片壓縮結果為空，請重新上傳。');
      const result=blob.size<file.size?new File([blob],file.name.replace(/\.[^.]+$/,'')+(blob.type==='video/mp4'?'.mp4':'.webm'),{type:blob.type}):file;
      if(result.size>25*1024*1024)throw Error('保持清晰度壓縮後仍超過 25 MB，請剪短影片或填寫 YouTube／Facebook 連結。');
      onProgress('影片處理完成');return result;
    }finally{clearTimeout(timer);cancelAnimationFrame(frame);v.pause();if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());source?.disconnect();await audio?.close();v.removeAttribute('src');v.load();URL.revokeObjectURL(url)}
  }
  async function prepare(file,options={}){
    if(!file)return file;
    const key=options.maxDimension||2560;
    let entries=cache.get(file);if(!entries){entries=new Map();cache.set(file,entries)}
    if(entries.has(key))return entries.get(key);
    const promise=file.type.startsWith('image/')?image(file,key):file.type.startsWith('video/')?video(file,options.onProgress):Promise.resolve(file);
    entries.set(key,promise);try{return await promise}catch(err){entries.delete(key);throw err}
  }
  window.HaojuMedia={prepare,dimensions};
})();
