onmessage=async e=>{const[file,content,rand]=e.data;try{const handle=await file.createSyncAccessHandle();handle.write(content);handle.close();postMessage([rand,true])}catch{postMessage([rand,false])}};
//# sourceMappingURL=dirrWorker.js.map