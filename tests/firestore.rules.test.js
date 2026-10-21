import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDocFromServer,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  documentId,
  writeBatch,
} from 'firebase/firestore';

const OWNER = 'owner-a';
const OTHER = 'owner-b';
const PATH = `users/${OWNER}/progress/main`;
const DELETION_PATH = `accountDeletions/${OWNER}`;
const MAX_PAYLOAD_BYTES = 128 * 1024;
let environment;

test('welcome receipt is private, immutable, and deletable only after account deletion', async () => {
  const target=doc(verifiedDb(),`users/${OWNER}/preferences/onboarding`);
  await assertSucceeds(setDoc(target,{version:1,seen:true,seenAt:serverTimestamp()}));
  await assertSucceeds(getDocFromServer(target));
  await assertFails(getDocFromServer(doc(verifiedDb(OTHER),`users/${OWNER}/preferences/onboarding`)));
  await assertFails(updateDoc(target,{seen:false}));
  await assertFails(deleteDoc(target));
  await seedDeletion();
  await assertSucceeds(deleteDoc(target));
});

test('welcome receipt rejects unverified accounts, extra fields and spoofed timestamps', async () => {
  const path=`users/${OWNER}/preferences/onboarding`;
  await assertFails(setDoc(doc(environment.authenticatedContext(OWNER,{email_verified:false}).firestore(),path),{version:1,seen:true,seenAt:serverTimestamp()}));
  await assertFails(setDoc(doc(verifiedDb(),path),{version:1,seen:true,seenAt:serverTimestamp(),extra:'unneeded'}));
  await assertFails(setDoc(doc(verifiedDb(),path),{version:1,seen:true,seenAt:Timestamp.fromMillis(1)}));
});

function verifiedDb(uid = OWNER) {
  return environment.authenticatedContext(uid, { email_verified: true }).firestore();
}

function progress(overrides = {}) {
  return {
    schemaVersion: 1,
    payload: JSON.stringify({ version: 5, completed: {}, sessions: [] }),
    updatedAt: serverTimestamp(),
    revision: 1,
    ...overrides,
  };
}

async function seed(path = PATH, revision = 1) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), progress({
      updatedAt: Timestamp.fromMillis(1),
      revision,
    }));
  });
}

async function seedDeletion(uid = OWNER) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `accountDeletions/${uid}`), {
      deletedAt: Timestamp.fromMillis(1),
    });
  });
}

describe('Reglas de progreso de Brote', { concurrency: false }, () => {
  before(async () => {
    const address = process.env.FIRESTORE_EMULATOR_HOST;
    if (!address) {
      throw new Error('Falta FIRESTORE_EMULATOR_HOST. Ejecuta estas pruebas con firebase emulators:exec --only firestore.');
    }
    const endpoint = new URL(`http://${address}`);
    environment = await initializeTestEnvironment({
      projectId: 'demo-brote-rules',
      firestore: {
        host: endpoint.hostname,
        port: Number(endpoint.port),
        rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  after(async () => {
    await environment?.cleanup();
  });

  test('three-path format upgrades in place and cannot be overwritten by an older app',async()=>{
    const reference=doc(verifiedDb(),PATH);
    await assertSucceeds(setDoc(reference,progress()));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:2,revision:2})));
    await assertFails(setDoc(reference,progress({schemaVersion:1,revision:3})));
    assert.equal((await getDocFromServer(reference)).data().revision,2);
    await assertSucceeds(setDoc(reference,progress({schemaVersion:2,revision:3})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:3,revision:4})));
    await assertFails(setDoc(reference,progress({schemaVersion:2,revision:5})));
    await assertFails(setDoc(reference,progress({schemaVersion:1,revision:5})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:3,revision:5})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:4,revision:6})));
    await assertFails(setDoc(reference,progress({schemaVersion:3,revision:7})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:4,revision:7})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:5,revision:8})));
    for(const schemaVersion of [1,2,3,4])await assertFails(setDoc(reference,progress({schemaVersion,revision:9})));
    assert.equal((await getDocFromServer(reference)).data().revision,8);
    await assertSucceeds(setDoc(reference,progress({schemaVersion:5,revision:9})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:6,revision:10})));
    for(const schemaVersion of [1,2,3,4,5])await assertFails(setDoc(reference,progress({schemaVersion,revision:11})));
    assert.equal((await getDocFromServer(reference)).data().schemaVersion,6);
    assert.equal((await getDocFromServer(reference)).data().revision,10);
    await assertSucceeds(setDoc(reference,progress({schemaVersion:6,revision:11})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:7,revision:12})));
    for(const schemaVersion of [1,2,3,4,5,6])await assertFails(setDoc(reference,progress({schemaVersion,revision:13})));
    assert.equal((await getDocFromServer(reference)).data().schemaVersion,7);
    await assertSucceeds(setDoc(reference,progress({schemaVersion:7,revision:13})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:8,revision:14})));
    for(const schemaVersion of [1,2,3,4,5,6,7])await assertFails(setDoc(reference,progress({schemaVersion,revision:15})));
    assert.equal((await getDocFromServer(reference)).data().schemaVersion,8);
    await assertSucceeds(setDoc(reference,progress({schemaVersion:8,revision:15})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:9,revision:16})));
    for(const schemaVersion of [1,2,3,4,5,6,7,8])await assertFails(setDoc(reference,progress({schemaVersion,revision:17})));
    assert.equal((await getDocFromServer(reference)).data().schemaVersion,9);
    await assertSucceeds(setDoc(reference,progress({schemaVersion:9,revision:17})));
    await assertFails(setDoc(reference,progress({schemaVersion:10,revision:18})));
  });

  test('new format keeps isolation, verification and the deletion barrier',async()=>{
    const db=verifiedDb(),reference=doc(db,PATH);
    await assertFails(setDoc(doc(verifiedDb(OTHER),PATH),progress({schemaVersion:2})));
    await assertFails(setDoc(doc(environment.authenticatedContext(OWNER,{email_verified:false}).firestore(),PATH),progress({schemaVersion:2})));
    await assertSucceeds(setDoc(reference,progress({schemaVersion:2})));
    const deletion=writeBatch(db);deletion.set(doc(db,DELETION_PATH),{deletedAt:serverTimestamp()});deletion.delete(reference);
    await assertSucceeds(deletion.commit());
    await assertFails(setDoc(reference,progress({schemaVersion:2})));
    await assertFails(setDoc(reference,progress({schemaVersion:1})));
  });

  test('el propietario puede crear, leer y actualizar; borrar exige marcador atómico o previo', async () => {
    const db = verifiedDb();
    const reference = doc(db, PATH);
    await assertSucceeds(setDoc(reference, progress()));
    const created = await assertSucceeds(getDocFromServer(reference));
    assert.equal(created.data().revision, 1);
    await assertSucceeds(updateDoc(reference, {
      payload: JSON.stringify({ version: 5, completed: { 0: { firstTry: 4 } } }),
      updatedAt: serverTimestamp(),
      revision: 2,
    }));
    const updated = await assertSucceeds(getDocFromServer(reference));
    assert.equal(updated.data().revision, 2);
    await assertFails(deleteDoc(reference));
    assert.equal((await getDocFromServer(reference)).data().revision, 2);
    const deletion = writeBatch(db);
    deletion.set(doc(db, DELETION_PATH), { deletedAt: serverTimestamp() });
    deletion.delete(reference);
    await assertSucceeds(deletion.commit());
    await assertFails(getDocFromServer(reference));
    await environment.withSecurityRulesDisabled(async (context) => {
      assert.equal((await getDocFromServer(doc(context.firestore(), PATH))).exists(), false);
    });
  });

  for (const identity of ['invitado', 'sin verificar', 'sin atributo de verificación', 'otra cuenta']) {
    test(`${identity} no puede leer, crear, actualizar ni borrar progreso ajeno o no autorizado`, async () => {
      const db = identity === 'invitado'
        ? environment.unauthenticatedContext().firestore()
        : identity === 'sin verificar'
          ? environment.authenticatedContext(OWNER, { email_verified: false }).firestore()
          : identity === 'sin atributo de verificación'
            ? environment.authenticatedContext(OWNER).firestore()
            : verifiedDb(OTHER);
      const reference = doc(db, PATH);
      await assertFails(setDoc(reference, progress()));
      await seed();
      await assertFails(getDocFromServer(reference));
      await assertFails(updateDoc(reference, { updatedAt: serverTimestamp(), revision: 2 }));
      await assertFails(deleteDoc(reference));
    });
  }

  test('una cuenta nueva puede consultar la inexistencia de su propio documento', async () => {
    const snapshot = await assertSucceeds(getDocFromServer(doc(verifiedDb(), PATH)));
    assert.equal(snapshot.exists(), false);
  });

  test('ningún propietario puede listar documentos, ni con un filtro por main', async () => {
    await seed();
    const db = verifiedDb();
    const progressCollection = collection(db, `users/${OWNER}/progress`);
    await assertFails(getDocs(progressCollection));
    await assertFails(getDocs(query(progressCollection, where(documentId(), '==', 'main'))));
    await assertFails(getDocs(collectionGroup(db, 'progress')));
    await assertFails(getDocs(collection(db, 'users')));
  });

  for (const path of [
    `users/${OWNER}`,
    `users/${OWNER}/progress/other`,
    `users/${OWNER}/progress/main/private/item`,
    `users/${OWNER}/profile/main`,
    'public/main',
    'settings/main',
  ]) {
    test(`la ruta no autorizada ${path} queda cerrada`, async () => {
      const reference = doc(verifiedDb(), path);
      await assertFails(setDoc(reference, progress()));
      await seed(path);
      await assertFails(getDocFromServer(reference));
      await assertFails(updateDoc(reference, { updatedAt: serverTimestamp(), revision: 2 }));
      await assertFails(deleteDoc(reference));
    });
  }

  for (const field of ['schemaVersion', 'payload', 'updatedAt', 'revision']) {
    test(`crear sin ${field} está prohibido`, async () => {
      const data = progress();
      delete data[field];
      await assertFails(setDoc(doc(verifiedDb(), PATH), data));
    });
    test(`eliminar ${field} mediante una actualización está prohibido`, async () => {
      await seed();
      await assertFails(updateDoc(doc(verifiedDb(), PATH), {
        updatedAt: serverTimestamp(),
        revision: 2,
        [field]: deleteField(),
      }));
    });
  }

  test('campos extra, incluidos privilegios y datos de perfil, están prohibidos', async () => {
    const reference = doc(verifiedDb(), PATH);
    for (const field of ['premium', 'email', 'ownerUid', 'extra']) {
      await assertFails(setDoc(reference, progress({ [field]: true })));
    }
    await seed();
    await assertFails(updateDoc(reference, {
      premium: true,
      updatedAt: serverTimestamp(),
      revision: 2,
    }));
  });

  for (const schemaVersion of [0, 10, 1.5, '1', null]) {
    test(`rechaza schemaVersion ${JSON.stringify(schemaVersion)}`, async () => {
      await assertFails(setDoc(doc(verifiedDb(), PATH), progress({ schemaVersion })));
    });
  }

  for (const payload of [null, 123, {}, [], true]) {
    test(`rechaza payload que no sea texto: ${JSON.stringify(payload)}`, async () => {
      await assertFails(setDoc(doc(verifiedDb(), PATH), progress({ payload })));
    });
  }

  test('admite exactamente 128 KiB UTF-8 y rechaza un byte adicional', async () => {
    const reference = doc(verifiedDb(), PATH);
    const boundary = JSON.stringify('a'.repeat(MAX_PAYLOAD_BYTES - 2));
    assert.equal(Buffer.byteLength(boundary, 'utf8'), MAX_PAYLOAD_BYTES);
    await assertSucceeds(setDoc(reference, progress({ payload: boundary })));
    await assertFails(updateDoc(reference, {
      payload: boundary + ' ',
      updatedAt: serverTimestamp(),
      revision: 2,
    }));
  });

  test('el límite cuenta bytes también con caracteres multibyte', async () => {
    const reference = doc(verifiedDb(), PATH);
    const boundary = JSON.stringify('é'.repeat((MAX_PAYLOAD_BYTES - 2) / 2));
    assert.equal(Buffer.byteLength(boundary, 'utf8'), MAX_PAYLOAD_BYTES);
    await assertSucceeds(setDoc(reference, progress({ payload: boundary })));
    const tooLarge = JSON.stringify('é'.repeat(MAX_PAYLOAD_BYTES / 2));
    assert.ok(tooLarge.length < MAX_PAYLOAD_BYTES);
    assert.ok(Buffer.byteLength(tooLarge, 'utf8') > MAX_PAYLOAD_BYTES);
    await assertFails(updateDoc(reference, {
      payload: tooLarge,
      updatedAt: serverTimestamp(),
      revision: 2,
    }));
  });

  for (const revision of [-1, 0, 2, 1.5, '1', null]) {
    test(`crear exige revision 1, rechaza ${JSON.stringify(revision)}`, async () => {
      await assertFails(setDoc(doc(verifiedDb(), PATH), progress({ revision })));
    });
  }

  for (const revision of [-1, 0, 1, 3, 2.5, '2', null]) {
    test(`actualizar revision 1 exige 2, rechaza ${JSON.stringify(revision)}`, async () => {
      await seed();
      await assertFails(updateDoc(doc(verifiedDb(), PATH), {
        updatedAt: serverTimestamp(),
        revision,
      }));
    });
  }

  test('dos escrituras con la misma revisión no pueden sobrescribirse silenciosamente', async () => {
    await seed();
    const firstDevice = doc(verifiedDb(), PATH);
    const secondDevice = doc(verifiedDb(), PATH);
    await assertSucceeds(updateDoc(firstDevice, {
      payload: '{"device":"first"}',
      updatedAt: serverTimestamp(),
      revision: 2,
    }));
    await assertFails(updateDoc(secondDevice, {
      payload: '{"device":"second"}',
      updatedAt: serverTimestamp(),
      revision: 2,
    }));
    assert.equal((await getDocFromServer(firstDevice)).data().payload, '{"device":"first"}');
  });

  test('sobrescribir con setDoc tampoco permite reiniciar la revisión', async () => {
    await seed();
    await assertFails(setDoc(doc(verifiedDb(), PATH), progress()));
  });

  for (const updatedAt of [Timestamp.fromMillis(1), 'ahora', 123, null]) {
    test(`rechaza una fecha enviada por el cliente: ${String(updatedAt)}`, async () => {
      await assertFails(setDoc(doc(verifiedDb(), PATH), progress({ updatedAt })));
    });
  }

  test('actualizar exige renovar updatedAt con la hora del servidor', async () => {
    await seed();
    await assertFails(updateDoc(doc(verifiedDb(), PATH), { revision: 2 }));
  });

  test('el propietario verificado puede consultar y crear su marcador de eliminación', async () => {
    const reference = doc(verifiedDb(), DELETION_PATH);
    assert.equal((await assertSucceeds(getDocFromServer(reference))).exists(), false);
    await assertSucceeds(setDoc(reference, { deletedAt: serverTimestamp() }));
    const data = (await assertSucceeds(getDocFromServer(reference))).data();
    assert.deepEqual(Object.keys(data), ['deletedAt']);
    assert(data.deletedAt instanceof Timestamp);
  });

  for (const identity of ['guest', 'unverified', 'missing-verification', 'other-account']) {
    test(`${identity} no puede acceder ni modificar el marcador del propietario`, async () => {
      const db = identity === 'guest'
        ? environment.unauthenticatedContext().firestore()
        : identity === 'unverified'
          ? environment.authenticatedContext(OWNER, { email_verified: false }).firestore()
          : identity === 'missing-verification'
            ? environment.authenticatedContext(OWNER).firestore()
            : verifiedDb(OTHER);
      const reference = doc(db, DELETION_PATH);
      await assertFails(getDocFromServer(reference));
      await assertFails(setDoc(reference, { deletedAt: serverTimestamp() }));
      await seedDeletion();
      await assertFails(getDocFromServer(reference));
      await assertFails(updateDoc(reference, { deletedAt: serverTimestamp() }));
      await assertFails(deleteDoc(reference));
    });
  }

  test('los marcadores no se pueden listar ni consultar mediante filtros', async () => {
    await seedDeletion();
    const db = verifiedDb();
    await assertFails(getDocs(collection(db, 'accountDeletions')));
    await assertFails(getDocs(query(collection(db, 'accountDeletions'), where(documentId(), '==', OWNER))));
    await assertFails(getDocs(collectionGroup(db, 'accountDeletions')));
  });

  test('el marcador exige exactamente deletedAt y no admite datos de perfil ni privilegios', async () => {
    const reference = doc(verifiedDb(), DELETION_PATH);
    await assertFails(setDoc(reference, {}));
    for (const field of ['email', 'uid', 'premium', 'payload', 'extra']) {
      await assertFails(setDoc(reference, { deletedAt: serverTimestamp(), [field]: 'unwanted' }));
    }
  });

  for (const deletedAt of [Timestamp.fromMillis(1), 'ahora', 123, null]) {
    test(`el marcador rechaza deletedAt enviado por el cliente: ${String(deletedAt)}`, async () => {
      await assertFails(setDoc(doc(verifiedDb(), DELETION_PATH), { deletedAt }));
    });
  }

  test('un marcador existente es inmutable y no puede borrarse ni recrearse', async () => {
    await seedDeletion();
    const reference = doc(verifiedDb(), DELETION_PATH);
    const original = (await getDocFromServer(reference)).data().deletedAt;
    await assertFails(updateDoc(reference, { deletedAt: serverTimestamp() }));
    await assertFails(updateDoc(reference, { deletedAt: deleteField() }));
    await assertFails(setDoc(reference, { deletedAt: serverTimestamp() }));
    await assertFails(setDoc(reference, { deletedAt: original }));
    await assertFails(deleteDoc(reference));
    assert((await getDocFromServer(reference)).data().deletedAt.isEqual(original));
  });

  test('las mismas claims verificadas no pueden leer, actualizar ni recrear progreso tras el marcador', async () => {
    // The same simulated claims remain valid throughout; no Auth invalidation is assumed.
    const db = verifiedDb();
    const reference = doc(db, PATH);
    await assertSucceeds(setDoc(reference, progress()));
    await assertSucceeds(setDoc(doc(db, DELETION_PATH), { deletedAt: serverTimestamp() }));
    await assertFails(getDocFromServer(reference));
    await assertFails(updateDoc(reference, { payload: '{}', updatedAt: serverTimestamp(), revision: 2 }));
    await assertFails(setDoc(reference, progress({ revision: 2 })));
    await assertSucceeds(deleteDoc(reference));
    await assertFails(getDocFromServer(reference));
    await assertFails(setDoc(reference, progress()));
    await assertSucceeds(deleteDoc(reference));
  });

  test('el marcador de una cuenta no bloquea el progreso de otra cuenta verificada', async () => {
    await seedDeletion();
    const db = verifiedDb(OTHER);
    const reference = doc(db, `users/${OTHER}/progress/main`);
    await assertSucceeds(setDoc(reference, progress()));
    assert.equal((await assertSucceeds(getDocFromServer(reference))).data().revision, 1);
    await assertSucceeds(updateDoc(reference, { updatedAt: serverTimestamp(), revision: 2 }));
    await assertFails(deleteDoc(reference));
    const deletion = writeBatch(db);
    deletion.set(doc(db, `accountDeletions/${OTHER}`), { deletedAt: serverTimestamp() });
    deletion.delete(reference);
    await assertSucceeds(deletion.commit());
  });

  test('un lote puede borrar el progreso y crear el marcador de forma atómica', async () => {
    await seed();
    const db = verifiedDb();
    const batch = writeBatch(db);
    batch.delete(doc(db, PATH));
    batch.set(doc(db, DELETION_PATH), { deletedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
    assert.equal((await getDocFromServer(doc(db, DELETION_PATH))).exists(), true);
    await environment.withSecurityRulesDisabled(async (context) => {
      assert.equal((await getDocFromServer(doc(context.firestore(), PATH))).exists(), false);
    });
  });

  test('un lote no puede crear marcador y progreso juntos aunque antes no existan', async () => {
    const db = verifiedDb();
    const batch = writeBatch(db);
    batch.set(doc(db, DELETION_PATH), { deletedAt: serverTimestamp() });
    batch.set(doc(db, PATH), progress());
    await assertFails(batch.commit());
    assert.equal((await getDocFromServer(doc(db, DELETION_PATH))).exists(), false);
    assert.equal((await getDocFromServer(doc(db, PATH))).exists(), false);
  });

  test('un lote no puede crear marcador y actualizar progreso existente juntos', async () => {
    await seed();
    const db = verifiedDb();
    const batch = writeBatch(db);
    batch.set(doc(db, DELETION_PATH), { deletedAt: serverTimestamp() });
    batch.update(doc(db, PATH), { payload: '{}', updatedAt: serverTimestamp(), revision: 2 });
    await assertFails(batch.commit());
    assert.equal((await getDocFromServer(doc(db, DELETION_PATH))).exists(), false);
    assert.equal((await getDocFromServer(doc(db, PATH))).data().revision, 1);
  });

  test('un lote no puede quitar el marcador para restaurar el progreso', async () => {
    await seedDeletion();
    const db = verifiedDb();
    const batch = writeBatch(db);
    batch.delete(doc(db, DELETION_PATH));
    batch.set(doc(db, PATH), progress());
    await assertFails(batch.commit());
    assert.equal((await getDocFromServer(doc(db, DELETION_PATH))).exists(), true);
  });

  test('la transacción de borrado admite reintentos sin modificar el marcador existente', async () => {
    await seed();
    const db = verifiedDb();
    const marker = doc(db, DELETION_PATH);
    const remove = () => runTransaction(db, async (transaction) => {
      const existing = await transaction.get(marker);
      if (!existing.exists()) transaction.set(marker, { deletedAt: serverTimestamp() });
      transaction.delete(doc(db, PATH));
    });
    await assertSucceeds(remove());
    const original = (await getDocFromServer(marker)).data().deletedAt;
    await assertSucceeds(remove());
    assert((await getDocFromServer(marker)).data().deletedAt.isEqual(original));
    await environment.withSecurityRulesDisabled(async (context) => {
      assert.equal((await getDocFromServer(doc(context.firestore(), PATH))).exists(), false);
    });
  });

  test('las subcolecciones del marcador permanecen cerradas', async () => {
    const path = `${DELETION_PATH}/private/item`;
    const reference = doc(verifiedDb(), path);
    await assertFails(setDoc(reference, { deletedAt: serverTimestamp() }));
    await seed(path);
    await assertFails(getDocFromServer(reference));
    await assertFails(updateDoc(reference, { deletedAt: serverTimestamp() }));
    await assertFails(deleteDoc(reference));
  });
});
