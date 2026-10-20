/** A remembered, verified account can read its own cached progress offline. */
export function learningAccess({configured,ready,user,currentUser,owner,status,busy=false,selecting=false,pending=false}) {
  const registered=value=>Boolean(value?.uid&&!value.isAnonymous);
  const same=registered(user)&&registered(currentUser)&&user===currentUser&&user.uid===currentUser.uid;
  const canLearn=Boolean(configured&&ready&&same&&user.emailVerified&&currentUser.emailVerified&&owner===user.uid&&!busy&&!selecting&&!pending&&!['loading','deletion-pending','storage-error','storage-invalid','update-required'].includes(status));
  if(canLearn)return {canLearn:true,mode:'open'};
  if(!configured)return {canLearn:false,mode:'unavailable'};
  if(!registered(currentUser)&&ready&&!busy)return {canLearn:false,mode:'signed-out'};
  if(same&&status==='deletion-pending')return {canLearn:false,mode:'blocked'};
  if(same&&status==='update-required')return {canLearn:false,mode:'unavailable'};
  if(same&&!currentUser.emailVerified&&!busy)return {canLearn:false,mode:'unverified'};
  if(['error','storage-error','storage-invalid'].includes(status)&&!ready)return {canLearn:false,mode:'unavailable'};
  return {canLearn:false,mode:'loading'};
}
