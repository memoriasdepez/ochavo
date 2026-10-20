import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

export const PROJECT = 'brote-62d26';
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const PREFIX = `${ROOT}/accountDeletions/`;
const MINIMUM_AGE_MS = 2 * 60 * 60 * 1000;

// Use Firestore's readTime, never the operator's computer clock, for token expiry.
export function deletionCandidate(entry) {
  const record = entry?.document;
  if (!record?.name?.startsWith(PREFIX)) return null;
  const uid = record.name.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null;
  if (Object.keys(record.fields || {}).join(',') !== 'deletedAt') return null;
  const deleted = Date.parse(record.fields.deletedAt?.timestampValue);
  const read = Date.parse(entry.readTime);
  if (!Number.isFinite(deleted) || !Number.isFinite(read) || read - deleted < MINIMUM_AGE_MS) return null;
  if (!record.updateTime || !Number.isFinite(Date.parse(record.updateTime))) return null;
  return {uid, name: record.name, updateTime: record.updateTime};
}

/** Recovery for an interrupted client cleanup. Codes remain consumed; no account identifier remains. */
export async function cleanupDeletedPromotions(uid,{listCodes,commit}) {
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw Error('Invalid deleted account identifier.');
  for(const field of ['createdBy','redeemedBy']){
    for(let page=0;page<100;page++){
      const codes=await listCodes(field,uid);
      if(!Array.isArray(codes)||codes.length>200)throw Error('Unconfirmed promotion cleanup page; marker retained.');
      if(!codes.length)break;
      const writes=codes.map(code=>{
        const prefix=ROOT+'/promoCodes/';
        if(!code?.name?.startsWith(prefix)||!/^[a-f0-9]{64}$/.test(code.name.slice(prefix.length))||!code.updateTime
          ||code.fields?.[field]?.stringValue!==uid||!['available','redeemed','disabled'].includes(code.fields?.status?.stringValue))throw Error('Unexpected promotion record; marker retained.');
        const fields={[field]:{stringValue:''}};
        if(field==='createdBy'){
          fields.label={stringValue:''};
          if(code.fields.status.stringValue==='available')fields.status={stringValue:'disabled'};
        }else if(code.fields.status.stringValue!=='redeemed')throw Error('Unexpected redeemed promotion state; marker retained.');
        return {update:{name:code.name,fields},updateMask:{fieldPaths:Object.keys(fields)},currentDocument:{updateTime:code.updateTime}};
      });
      await commit(writes);
      if(page===99)throw Error('Promotion cleanup page limit reached; marker retained. Rerun to continue.');
    }
  }
  await commit([{delete:ROOT+'/users/'+uid+'/promotions/lifetime'},{delete:ROOT+'/promoAdmins/'+uid}]);
}

export async function purgePage(entries, {lookup, remove, cleanup=async()=>{}, apply = false}) {
  const counts = {scanned: 0, eligible: 0, accountStillExists: 0, skipped: 0, removed: 0};
  for (const entry of entries) {
    if (!entry.document) continue;
    counts.scanned++;
    const candidate = deletionCandidate(entry);
    if (!candidate) { counts.skipped++; continue; }
    // An error or an unexpected lookup response aborts; neither means absence.
    const result = await lookup(candidate.uid);
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || Object.keys(result).some(key => !['users', 'kind'].includes(key))
      || (result.users !== undefined && !Array.isArray(result.users))) throw Error('Unconfirmed Authentication lookup; no marker removed.');
    if (result.users?.length) { counts.accountStillExists++; continue; }
    counts.eligible++;
    if (apply) {
      await cleanup(candidate.uid);
      await remove(candidate.name, candidate.updateTime);
      counts.removed++;
    }
  }
  return counts;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply')) throw Error('Use no arguments for a preview, or --apply to clean eligible markers.');
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const req = createRequire(path.join(appDir, 'package.json'));
  const auth = req('firebase-tools/lib/auth');
  const account = auth.getProjectDefaultAccount(appDir);
  if (!account) throw Error('Sign in with Firebase CLI before maintenance.');
  auth.setActiveAccount({}, account);
  const {Client} = req('firebase-tools/lib/apiv2');
  const firestore = new Client({urlPrefix: 'https://firestore.googleapis.com', auth: true});
  const identity = new Client({urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true});
  const totals = {scanned: 0, eligible: 0, accountStillExists: 0, skipped: 0, removed: 0};
  let cursor;
  for (let page = 0; page < 100; page++) {
    const structuredQuery = {
      from: [{collectionId: 'accountDeletions'}],
      orderBy: [{field: {fieldPath: '__name__'}, direction: 'ASCENDING'}],
      limit: 100,
      ...(cursor ? {startAt: {values: [{referenceValue: cursor}], before: false}} : {}),
    };
    const response = await firestore.post(`/v1/${ROOT}:runQuery`, {structuredQuery});
    if (!Array.isArray(response.body)) throw Error('Unexpected Firestore response; stopped.');
    const counts = await purgePage(response.body, {
      apply: args.includes('--apply'),
      lookup: async uid => (await identity.post(`/v1/projects/${PROJECT}/accounts:lookup`, {localId: [uid]})).body,
      cleanup: uid=>cleanupDeletedPromotions(uid,{
        listCodes:async(field,uid)=>{
          const result=await firestore.post(`/v1/${ROOT}:runQuery`,{structuredQuery:{from:[{collectionId:'promoCodes'}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:uid}}},limit:200}});
          if(!Array.isArray(result.body))throw Error('Unexpected promotion lookup response; marker retained.');
          return result.body.filter(row=>row.document).map(row=>row.document);
        },
        commit:writes=>firestore.post(`/v1/${ROOT}:commit`,{writes}),
      }),
      remove: async (name, updateTime) => firestore.delete(`/v1/${name}`, {queryParams: {'currentDocument.updateTime': updateTime}}),
    });
    for (const key of Object.keys(totals)) totals[key] += counts[key];
    const documents = response.body.filter(entry => entry.document);
    if (documents.length < 100) break;
    cursor = documents.at(-1).document.name;
    if (page === 99) console.log('Maintenance page limit reached; rerun to continue.');
  }
  console.log(JSON.stringify({project: PROJECT,mode: args.includes('--apply') ? 'apply' : 'preview',...totals}));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
