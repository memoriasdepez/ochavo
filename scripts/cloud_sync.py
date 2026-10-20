#!/usr/bin/env python3
"""Save this repository to its configured private GitHub origin without force pushes."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.cloud-sync'
GIT = os.environ.get('CLOUD_SYNC_GIT', 'git')
SECRET = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,}|sk-(?:proj-|svcacct-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,}')

def git(*args, check=True):
    p = subprocess.run([GIT, *args], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       env={**os.environ, 'GIT_TERMINAL_PROMPT':'0'}, timeout=600)
    if check and p.returncode:
        # Don't echo remote output, which can contain credentials or private file content.
        raise RuntimeError('Git failed: ' + args[0] + ' (exit ' + str(p.returncode) + ')')
    return p

def value(*args):
    return git(*args).stdout.decode('utf-8').strip()

def status(state, **extra):
    STATE.mkdir(exist_ok=True)
    data = {'state':state, 'utc':dt.datetime.now(dt.timezone.utc).isoformat(), **extra}
    tmp=STATE/'status.tmp'
    tmp.write_text(json.dumps(data, indent=2),encoding='utf-8')
    tmp.replace(STATE/'status.json')
    print(json.dumps(data),flush=True)

def validate():
    config=json.loads((ROOT/'.cloud-sync.json').read_text(encoding='utf-8'))
    actual=value('remote','get-url','origin').rstrip('/')
    expected=config['origin'].rstrip('/')
    if actual != expected:
        raise RuntimeError('Origin differs from the approved private repository')
    if config.get('branch') != 'main':
        raise RuntimeError('Unexpected destination branch')
    gd=Path(value('rev-parse','--absolute-git-dir'))
    if any((gd/x).exists() for x in ['MERGE_HEAD','rebase-merge','rebase-apply','CHERRY_PICK_HEAD','index.lock']):
        raise RuntimeError('Git operation in progress; retry when it is finished')
    if value('diff','--name-only','--diff-filter=U'):
        raise RuntimeError('Resolve unmerged files before saving')
    return config

def safety_check():
    for raw in git('ls-files','--cached','-z').stdout.split(b'\0'):
        if not raw:continue
        path=Path(os.fsdecode(raw)); f=ROOT/path
        if not f.is_file():continue
        name=f.name.lower()
        if (name == '.env' or (name.startswith('.env.') and not name.endswith('.example'))
            or f.suffix.lower() in {'.p12','.pfx','.p8','.key','.pem','.keystore','.jks','.dpapi'}):
            raise RuntimeError('Credential file blocked: '+path.as_posix())
    # Inspect only blobs being committed, including staged data rather than working copies.
    names=git('diff','--cached','--name-only','--diff-filter=ACMR','-z').stdout.split(b'\0')
    names=[raw for raw in names if raw]
    if not names:return
    # One streaming process also works for tens of thousands of restored files.
    with tempfile.TemporaryFile() as queries:
        for raw in names:
            if b'\n' in raw:raise RuntimeError('Unsupported newline in filename')
            queries.write(b':'+raw+b'\n')
        queries.seek(0)
        proc=subprocess.Popen([GIT,'cat-file','--batch'],cwd=ROOT,stdin=queries,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        try:
            for raw in names:
                name=os.fsdecode(raw)
                header=proc.stdout.readline().split()
                if len(header)!=3 or header[1]!=b'blob':raise RuntimeError('Cannot inspect staged file: '+name)
                size=int(header[2])
                if size>100*1024*1024:raise RuntimeError('File exceeds Git limit; configure Git LFS: '+name)
                if size<=12*1024*1024:
                    data=proc.stdout.read(size)
                    if b'\0' not in data[:8000] and SECRET.search(data):
                        raise RuntimeError('Possible credential blocked: '+name)
                else:
                    remaining=size
                    while remaining:
                        chunk=proc.stdout.read(min(remaining,1024*1024))
                        if not chunk:raise RuntimeError('Incomplete staged blob')
                        remaining-=len(chunk)
                if proc.stdout.read(1)!=b'\n':raise RuntimeError('Invalid staged blob framing')
            if proc.wait(timeout=30):raise RuntimeError('Staged-file inspection failed')
        finally:
            if proc.poll() is None:proc.kill();proc.wait()

def sync():
    config=validate()
    git('fetch','--quiet','origin','main')
    # Never overwrite work from another device or task. Keep local work intact on conflict.
    if git('merge-base','--is-ancestor','origin/main','HEAD',check=False).returncode:
        raise RuntimeError('Remote main has other changes. Stop editing, reconcile with origin/main, then retry; no files overwritten')
    git('add','--all')
    safety_check()
    if git('diff','--cached','--quiet',check=False).returncode:
        git('-c','user.name=memoriasdepez','-c','user.email=254508907+memoriasdepez@users.noreply.github.com',
            'commit','--quiet','-m','Guardar trabajo '+dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'))
    git('push','--quiet','origin','HEAD:refs/heads/main')
    head=value('rev-parse','HEAD')
    remote=value('ls-remote','origin','refs/heads/main').split()[0]
    if head!=remote:raise RuntimeError('Remote verification failed; retry')
    status('synced',commit=head,repository=config['origin'])

def fingerprint():
    # Tracked + nonignored new files; changes in ignored caches don't keep postponing a save.
    names=git('ls-files','--cached','--others','--exclude-standard','-z').stdout.split(b'\0')
    result=[]
    for raw in names:
        if raw:
            f=ROOT/os.fsdecode(raw)
            try:
                s=f.stat();result.append((raw,s.st_size,s.st_mtime_ns))
            except FileNotFoundError:result.append((raw,None,None))
    return tuple(result)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--watch',action='store_true')
    parser.add_argument('--once',action='store_true')
    parser.add_argument('--interval',type=float,default=15)
    parser.add_argument('--quiet',type=float,default=30)
    args=parser.parse_args()
    STATE.mkdir(exist_ok=True)
    lock=open(STATE/'process.lock','a+b')
    try:
        if os.name=='nt':
            import msvcrt
            lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
            msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except (OSError,BlockingIOError):
        print('Cloud save already running. Read .cloud-sync/status.json.');return 2
    try:
        if not args.watch:
            sync();return 0
        previous=fingerprint();changed=time.monotonic();last_synced=None
        status('watching',pid=os.getpid(),quiet_seconds=args.quiet)
        while True:
            current=fingerprint()
            if current!=previous:changed=time.monotonic();previous=current
            if current!=last_synced and time.monotonic()-changed>=args.quiet:
                try:
                    sync();last_synced=current
                except Exception as e:
                    status('blocked',error=str(e))
                    # Retry transient errors, preserving all work; never force or discard.
                    changed=time.monotonic()+45
            time.sleep(max(1,args.interval))
    except Exception as e:
        status('blocked',error=str(e));return 1
    finally:lock.close()

if __name__=='__main__':sys.exit(main())
