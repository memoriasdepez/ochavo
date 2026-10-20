import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Original short bell phrases, synthesized locally. No recordings or downloads.
const rate=44100;
const phrases={
  correct:{duration:.26,notes:[[0,659.25,.16],[.065,987.77,.18]]},
  chest:{duration:.78,notes:[[0,392,.14],[.075,523.25,.2],[.15,659.25,.2],[.225,783.99,.23],[.3,1046.5,.3],[.37,1318.51,.35]]},
  badge:{duration:.65,notes:[[0,523.25,.18],[.09,659.25,.2],[.18,783.99,.22],[.27,1046.5,.35]]},
};
const directory=fileURLToPath(new URL('../public/sounds/',import.meta.url));await mkdir(directory,{recursive:true});
for(const [kind,{duration,notes}] of Object.entries(phrases)){
  const count=Math.ceil(rate*duration),pcm=Buffer.alloc(count*2),wav=Buffer.alloc(44+pcm.length);
  for(let i=0;i<count;i++){
    const t=i/rate;let value=0;
    for(const [start,freq,length] of notes){
      const age=t-start;if(age<0||age>length)continue;
      const attack=Math.min(1,age/.006),release=Math.min(1,(length-age)/.035);
      const envelope=attack*release*Math.exp(-age*8);
      value+=.12*envelope*(Math.sin(2*Math.PI*freq*age)+.22*Math.sin(4*Math.PI*freq*age)+.08*Math.sin(6*Math.PI*freq*age));
    }
    pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),i*2);
  }
  wav.write('RIFF');wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
  await writeFile(directory+'/'+kind+'.wav',wav);
  console.log(`${kind}: ${Math.round(duration*1000)} ms, ${wav.length} bytes`);
}
