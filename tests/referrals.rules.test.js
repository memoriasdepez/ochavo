import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDocFromServer, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { createReferralBackend } from '../src/referrals.js';

const INVITER = 'referrer-a', INVITED = 'friend-b', OTHER = 'unrelated-c';
const CODE = 'ABCDEFGHJK', OTHER_CODE = 'LMNPQRSTUV';
const RECEIPT = '0123456789abcdef0123456789abcdef';
const OTHER_RECEIPT = 'abcdef0123456789abcdef0123456789';
const pointer = uid => `users/${uid}/referralCode/main`;
const attribution = uid => `referralAttributions/${uid}`;
const receipt = (uid = INVITER, id = RECEIPT) => `users/${uid}/referrals/${id}`;
const marker = uid => `accountDeletions/${uid}`;
let environment;
const db = (uid = INVITER, verified = true) => environment.authenticatedContext(uid, { email_verified: verified }).firestore();
const anon = () => environment.unauthenticatedContext().firestore();
const invitationData = (overrides = {}) => ({ inviterUid: INVITER, code: CODE, receiptId: RECEIPT, createdAt: serverTimestamp(), qualified: false, ...overrides });

async function seed(records) {
  await environment.withSecurityRulesDisabled(async context => {
    const batch = writeBatch(context.firestore());
    for (const [path, value] of Object.entries(records)) batch.set(doc(context.firestore(), path), value);
    await batch.commit();
  });
}
async function seedCode(uid = INVITER, code = CODE) {
  await seed({ [`inviteCodes/${code}`]: { uid, createdAt: Timestamp.fromMillis(1) }, [pointer(uid)]: { code, createdAt: Timestamp.fromMillis(1) } });
}
const seedAttribution = (overrides = {}) => seed({ [attribution(INVITED)]: invitationData({ createdAt: Timestamp.fromMillis(2), ...overrides }) });
const seedFirst = (uid = INVITED, lesson = 0) => seed({ [`users/${uid}/gameClaims/lesson-${lesson}`]: { eventId: 'verified-fixture-claim' } });
const seedDeletion = uid => seed({ [marker(uid)]: { deletedAt: Timestamp.fromMillis(3) } });
function issue(client = db(), uid = INVITER, code = CODE, codeExtra = {}, pointerExtra = {}) {
  const batch = writeBatch(client);
  batch.set(doc(client, `inviteCodes/${code}`), { uid, createdAt: serverTimestamp(), ...codeExtra });
  batch.set(doc(client, pointer(uid)), { code, createdAt: serverTimestamp(), ...pointerExtra });
  return batch.commit();
}
function qualify(client = db(INVITED), { targetUid = INVITER, targetReceipt = RECEIPT, attributionExtra = {}, receiptExtra = {} } = {}) {
  const batch = writeBatch(client);
  batch.update(doc(client, attribution(INVITED)), { qualified: true, qualifiedAt: serverTimestamp(), ...attributionExtra });
  batch.set(doc(client, receipt(targetUid, targetReceipt)), { qualifiedAt: serverTimestamp(), ...receiptExtra });
  return batch.commit();
}

describe('Private referral rules', { concurrency: false }, () => {
  before(async () => {
    const address = process.env.FIRESTORE_EMULATOR_HOST;
    if (!address) throw new Error('Run with firebase emulators:exec --only firestore; no production fallback.');
    const endpoint = new URL(`http://${address}`);
    environment = await initializeTestEnvironment({ projectId: 'demo-viruta-referrals', firestore: { host: endpoint.hostname, port: Number(endpoint.port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  });
  beforeEach(async () => { await environment.clearFirestore(); });
  after(async () => { await environment?.cleanup(); });

  test('verified owner creates an atomic code and pointer; only exact valid codes are publicly readable', async () => {
    await assertSucceeds(issue());
    const publicCode = await assertSucceeds(getDocFromServer(doc(anon(), `inviteCodes/${CODE}`)));
    assert.deepEqual(Object.keys(publicCode.data()).sort(), ['createdAt', 'uid']);
    assert.equal(publicCode.data().uid, INVITER);
    assert.equal((await assertSucceeds(getDocFromServer(doc(db(), pointer(INVITER))))).data().code, CODE);
    await assertFails(getDocs(collection(anon(), 'inviteCodes')));
    await assertFails(getDocs(collection(db(), 'inviteCodes')));
    await assertFails(getDocFromServer(doc(anon(), 'inviteCodes/short')));
    await assertFails(getDocFromServer(doc(db(OTHER), pointer(INVITER))));
  });

  test('code and pointer cannot be created separately or with mismatched linkage', async () => {
    const client = db();
    await assertFails(setDoc(doc(client, `inviteCodes/${CODE}`), { uid: INVITER, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(client, pointer(INVITER)), { code: CODE, createdAt: serverTimestamp() }));
    await assertFails(issue(client, INVITER, CODE, {}, { code: OTHER_CODE }));
    await assertFails(issue(client, INVITER, CODE, { uid: OTHER }));
  });

  for (const value of ['ABCDEFGHIJ', 'ABCDEFGHI0', 'abcde23456', 'ABCDEFGHJ', 'ABCDEFGHJKL']) {
    test(`invalid invitation alphabet or length rejected: ${value}`, async () => { await assertFails(issue(db(), INVITER, value)); });
  }
  for (const [label, factory] of [['anonymous', anon], ['unverified', () => db(INVITER, false)], ['another account', () => db(OTHER)]]) {
    test(`${label} cannot issue another verified owner's invitation`, async () => { await assertFails(issue(factory())); });
  }
  test('code metadata rejects personal data and fabricated timestamps', async () => {
    await assertFails(issue(db(), INVITER, CODE, { email: 'never-retained@example.invalid' }));
    await assertFails(issue(db(), INVITER, CODE, {}, { displayName: 'not-stored' }));
    await assertFails(issue(db(), INVITER, CODE, { createdAt: Timestamp.fromMillis(1) }));
  });
  test('one immutable invitation code per account; another account cannot take it', async () => {
    await assertSucceeds(issue());
    await assertFails(issue(db(), INVITER, OTHER_CODE));
    await assertFails(issue(db(OTHER), OTHER, CODE));
    await assertFails(updateDoc(doc(db(), `inviteCodes/${CODE}`), { uid: OTHER }));
    await assertFails(updateDoc(doc(db(), pointer(INVITER)), { code: OTHER_CODE }));
  });
  test('deletion marker blocks code creation, including a marker in the same batch', async () => {
    await seedDeletion(INVITER);
    await assertFails(issue());
    const client = db(OTHER), batch = writeBatch(client);
    batch.set(doc(client, marker(OTHER)), { deletedAt: serverTimestamp() });
    batch.set(doc(client, `inviteCodes/${OTHER_CODE}`), { uid: OTHER, createdAt: serverTimestamp() });
    batch.set(doc(client, pointer(OTHER)), { code: OTHER_CODE, createdAt: serverTimestamp() });
    await assertFails(batch.commit());
  });

  test('verified newcomer can link once; attribution is readable only by its owner during normal use', async () => {
    await seedCode();
    const client = db(INVITED);
    await assertSucceeds(setDoc(doc(client, attribution(INVITED)), invitationData()));
    const record = await assertSucceeds(getDocFromServer(doc(client, attribution(INVITED))));
    assert.equal(record.data().qualified, false);
    await assertFails(getDocFromServer(doc(db(), attribution(INVITED))));
    await assertFails(getDocFromServer(doc(db(OTHER), attribution(INVITED))));
    await assertFails(getDocs(query(collection(db(), 'referralAttributions'), where('inviterUid', '==', INVITER))));
    await assertFails(getDocs(collection(client, 'referralAttributions')));
  });
  test('self-referral, absent codes, mismatched owners and invalid receipt IDs are rejected', async () => {
    await seedCode();
    await assertFails(setDoc(doc(db(), attribution(INVITER)), invitationData()));
    await assertFails(setDoc(doc(db(INVITED), attribution(INVITED)), invitationData({ code: OTHER_CODE })));
    await assertFails(setDoc(doc(db(INVITED), attribution(INVITED)), invitationData({ inviterUid: OTHER })));
    for (const receiptId of ['short', 'G'.repeat(32), '0'.repeat(33)]) await assertFails(setDoc(doc(db(INVITED), attribution(INVITED)), invitationData({ receiptId })));
  });
  test('only the verified invited account may create its attribution without extra personal fields', async () => {
    await seedCode();
    for (const client of [anon(), db(INVITED, false), db(OTHER)]) await assertFails(setDoc(doc(client, attribution(INVITED)), invitationData()));
    await assertFails(setDoc(doc(db(INVITED), attribution(INVITED)), invitationData({ email: 'not-stored@example.invalid' })));
    await assertFails(setDoc(doc(db(INVITED), attribution(INVITED)), invitationData({ qualified: true })));
    await assertFails(setDoc(doc(db(INVITED), attribution(INVITED)), invitationData({ createdAt: Timestamp.fromMillis(1) })));
  });
  test('attribution cannot be switched to another inviter or receipt', async () => {
    await seedCode(); await seedCode(OTHER, OTHER_CODE); await seedAttribution();
    const ref = doc(db(INVITED), attribution(INVITED));
    await assertFails(setDoc(ref, invitationData({ inviterUid: OTHER, code: OTHER_CODE })));
    await assertFails(updateDoc(ref, { receiptId: OTHER_RECEIPT }));
    await assertFails(deleteDoc(ref));
  });
  for (const lesson of [0, 100, 150, 450, 950, 1150, 1450]) {
    test(`completing the first lesson ${lesson} before linkage prevents late attribution`, async () => {
      await seedCode(); await seedFirst(INVITED, lesson);
      await assertFails(setDoc(doc(db(INVITED), attribution(INVITED)), invitationData()));
    });
    test(`first lesson ${lesson} qualifies an existing invitation atomically`, async () => {
      await seedAttribution(); await seedFirst(INVITED, lesson);
      await assertSucceeds(qualify());
      const record = await assertSucceeds(getDocFromServer(doc(db(INVITED), attribution(INVITED))));
      const reward = await assertSucceeds(getDocFromServer(doc(db(), receipt())));
      assert.equal(record.data().qualified, true);
      assert.deepEqual(Object.keys(reward.data()), ['qualifiedAt']);
      assert.equal(record.data().qualifiedAt.toMillis(), reward.data().qualifiedAt.toMillis());
    });
  }
  for (const uid of [INVITER, INVITED]) {
    test(`deleted account ${uid} blocks attribution and qualification`, async () => {
      await seedCode(); await seedDeletion(uid);
      await assertFails(setDoc(doc(db(INVITED), attribution(INVITED)), invitationData()));
      await seedAttribution(); await seedFirst();
      await assertFails(qualify());
    });
  }
  test('qualification without a first lesson, or with an unrelated claim, is rejected', async () => {
    await seedAttribution();
    await assertFails(qualify());
    await seedFirst(INVITED, 1);
    await assertFails(qualify());
  });
  test('real SDK backend qualifies a technical-first student and blocks attaching an invitation afterwards',async()=>{
    await seedCode();
    const friend=createReferralBackend(db(INVITED));
    await assertSucceeds(friend.attach(INVITED,CODE));
    await seedFirst(INVITED,1450);
    assert.equal(await assertSucceeds(friend.qualify(INVITED)),true);
    const late=createReferralBackend(db(OTHER));
    await seedFirst(OTHER,1450);
    await assert.rejects(late.attach(OTHER,CODE),/antes de completar la primera lección/);
  });
  test('neither half of qualification can be written alone', async () => {
    await seedAttribution(); await seedFirst();
    await assertFails(updateDoc(doc(db(INVITED), attribution(INVITED)), { qualified: true, qualifiedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db(INVITED), receipt()), { qualifiedAt: serverTimestamp() }));
    assert.equal((await getDocFromServer(doc(db(INVITED), attribution(INVITED)))).data().qualified, false);
    assert.equal((await getDocFromServer(doc(db(), receipt()))).exists(), false);
  });
  test('a receipt cannot be redirected or include a friend identity', async () => {
    await seedAttribution(); await seedFirst();
    await assertFails(qualify(db(INVITED), { targetUid: OTHER }));
    await assertFails(qualify(db(INVITED), { targetReceipt: OTHER_RECEIPT }));
    await assertFails(qualify(db(INVITED), { receiptExtra: { friendUid: INVITED } }));
    await assertFails(qualify(db(INVITED), { receiptExtra: { email: 'not-stored@example.invalid' } }));
  });
  test('qualification cannot rewrite linkage or fabricate time', async () => {
    await seedAttribution(); await seedFirst();
    await assertFails(qualify(db(INVITED), { attributionExtra: { inviterUid: OTHER } }));
    await assertFails(qualify(db(INVITED), { attributionExtra: { receiptId: OTHER_RECEIPT } }));
    await assertFails(qualify(db(INVITED), { attributionExtra: { qualifiedAt: Timestamp.fromMillis(1) } }));
  });
  test('repeated qualification creates no second receipt and cannot reset qualified status', async () => {
    await seedAttribution(); await seedFirst(); await assertSucceeds(qualify());
    await assertFails(qualify());
    await assertFails(qualify(db(INVITED), { targetReceipt: OTHER_RECEIPT }));
    await assertFails(updateDoc(doc(db(INVITED), attribution(INVITED)), { qualified: false }));
    const results = await assertSucceeds(getDocs(collection(db(), `users/${INVITER}/referrals`)));
    assert.equal(results.size, 1);
  });
  test('receipt owner can list anonymous receipts; invited or unrelated accounts cannot read them', async () => {
    await seedAttribution(); await seedFirst(); await qualify();
    await assertSucceeds(getDocs(collection(db(), `users/${INVITER}/referrals`)));
    for (const client of [anon(), db(INVITED), db(OTHER), db(INVITER, false)]) {
      await assertFails(getDocFromServer(doc(client, receipt())));
      await assertFails(getDocs(collection(client, `users/${INVITER}/referrals`)));
    }
    await assertFails(updateDoc(doc(db(), receipt()), { qualifiedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db(), receipt())));
  });
  test('deletion in the qualification batch blocks both sides without partial reward', async () => {
    await seedAttribution(); await seedFirst();
    const client = db(INVITED), batch = writeBatch(client);
    batch.set(doc(client, marker(INVITED)), { deletedAt: serverTimestamp() });
    batch.update(doc(client, attribution(INVITED)), { qualified: true, qualifiedAt: serverTimestamp() });
    batch.set(doc(client, receipt()), { qualifiedAt: serverTimestamp() });
    await assertFails(batch.commit());
    assert.equal((await getDocFromServer(doc(db(), receipt()))).exists(), false);
  });

  test('deleting the invited account removes its attribution but cannot erase another owner reward', async () => {
    await seedAttribution(); await seedFirst(); await qualify(); await seedDeletion(INVITED);
    await assertSucceeds(deleteDoc(doc(db(INVITED), attribution(INVITED))));
    await assertFails(deleteDoc(doc(db(INVITED), receipt())));
    assert.equal((await getDocFromServer(doc(db(), receipt()))).exists(), true);
  });
  test('deleting the inviter may query only its own attributions and remove them', async () => {
    await seedAttribution(); await seed({ [attribution(OTHER)]: invitationData({ inviterUid: 'another-referrer', code: OTHER_CODE, receiptId: OTHER_RECEIPT, createdAt: Timestamp.fromMillis(2) }) });
    await seedDeletion(INVITER);
    const client = db();
    const own = await assertSucceeds(getDocs(query(collection(client, 'referralAttributions'), where('inviterUid', '==', INVITER))));
    assert.deepEqual(own.docs.map(record => record.id), [INVITED]);
    await assertFails(getDocs(collection(client, 'referralAttributions')));
    await assertFails(getDocs(query(collection(client, 'referralAttributions'), where('inviterUid', '==', 'another-referrer'))));
    await assertFails(getDocFromServer(doc(client, attribution(INVITED))));
    await assertSucceeds(deleteDoc(doc(client, attribution(INVITED))));
    await assertFails(deleteDoc(doc(client, attribution(OTHER))));
    assert.equal((await getDocFromServer(doc(db(INVITED), attribution(INVITED)))).exists(), false);
  });
  test('code, pointer and own anonymous receipts require a prior deletion marker to remove', async () => {
    await seedCode(); await seedAttribution(); await seedFirst(); await qualify();
    for (const path of [`inviteCodes/${CODE}`, pointer(INVITER), receipt()]) await assertFails(deleteDoc(doc(db(), path)));
    await seedDeletion(INVITER);
    const client = db(), batch = writeBatch(client);
    for (const path of [`inviteCodes/${CODE}`, pointer(INVITER), receipt()]) batch.delete(doc(client, path));
    await assertSucceeds(batch.commit());
    assert.equal((await getDocFromServer(doc(anon(), `inviteCodes/${CODE}`))).exists(), false);
    await assertFails(issue());
  });
  test('real SDK backend links, qualifies once and removes inverse attribution under the combined rules', async () => {
    const referrer = createReferralBackend(db()), friend = createReferralBackend(db(INVITED));
    const code = await assertSucceeds(referrer.getCode(INVITER));
    assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
    assert.equal(await referrer.getCode(INVITER), code);
    assert.deepEqual(await assertSucceeds(friend.attach(INVITED, code)), { linked: true, already: false });
    assert.deepEqual(await assertSucceeds(friend.attach(INVITED, code)), { linked: true, already: true });
    assert.equal(await assertSucceeds(friend.qualify(INVITED)), false);
    await seedFirst();
    assert.equal(await assertSucceeds(friend.qualify(INVITED)), true);
    assert.equal(await assertSucceeds(friend.qualify(INVITED)), false);
    const before = await assertSucceeds(referrer.read(INVITER));
    assert.equal(before.receipts.length, 1);
    await seedDeletion(INVITER);
    await assertSucceeds(referrer.remove(INVITER));
    assert.equal((await getDocFromServer(doc(anon(), `inviteCodes/${code}`))).exists(), false);
    assert.equal((await getDocFromServer(doc(db(INVITED), attribution(INVITED)))).exists(), false);
    assert.equal((await getDocs(collection(db(), `users/${INVITER}/referrals`))).size, 0);
    assert.equal((await getDocFromServer(doc(db(), pointer(INVITER)))).exists(), false);
  });
});

