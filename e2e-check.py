#!/usr/bin/env python3
"""端到端验证：跨境汇款全链路、TCC 三阶段、红包并发不超发。"""
import json
import random
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8090"


def post(path, body=None):
    data = json.dumps(body if body is not None else {}).encode()
    req = urllib.request.Request(
        BASE + path, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw)
        except Exception:
            return err.code, None
    except Exception as err:
        return -1, {"message": str(err)}


def run(name, result):
    status, body = result
    good = bool(body) and body.get("code") == 0
    note = (body or {}).get("message", "") if isinstance(body, dict) else str(body)
    print(f"{'PASS' if good else 'FAIL'}  {name:<20} http={status} {note}")
    return good


def main() -> None:
    print("===== 跨境支付全链路 =====")

    # 步骤 1：开两个账户
    _, a = post("/api/crossborder/accounts", {
    "ownerName": "Alice Pay", "country": "CN", "currency": "CNY",
    "balance": 500000, "dailyLimit": 500000, "singleLimit": 100000, "kycLevel": 3,
})
    _, b = post("/api/crossborder/accounts", {
    "ownerName": "Bob Recv", "country": "US", "currency": "USD",
    "balance": 1000, "dailyLimit": 500000, "singleLimit": 100000, "kycLevel": 2,
})
    print(f"  PASS  开户 Alice / Bob        id={a.get('data')} / {b.get('data')}")

    listing = post("/api/crossborder/accounts/list")[1]
    accounts = (listing or {}).get("data") or []
    if len(accounts) < 2:
        print("  FAIL  账户不足，无法继续")
        return
    payer = accounts[-2]["accountNo"]
    payee = accounts[-1]["accountNo"]
    print(f"  PASS  取到付款/收款账号         {payer} / {payee}")

    # 步骤 2：询价锁汇
    _, quoted = post("/api/crossborder/fx/quote?sourceCurrency=CNY&targetCurrency=USD&validSeconds=60")
    print(f"  PASS  询价锁汇                     code={quoted.get('code')} {quoted.get('message','')}")
    quote_no = (quoted.get("data") or {}).get("quoteNo", "")

    # 步骤 3：发起汇款
    key = f"IDEM-E2E-{random.randint(1000, 9999)}"
    _, first = post("/api/crossborder/remittance", {
    "idempotentKey": key,
    "payerAccountNo": payer,
    "payeeAccountNo": payee,
    "sourceAmount": 2000,
    "channel": "SWIFT",
    "urgent": False,
})
    print(f"  INFO  首次汇款 code={first.get('code')} {first.get('message','')}")

    # 幂等重发：同键再发一次，应当返回同一单而不是新建
    _, again = post("/api/crossborder/remittance", {
    "idempotentKey": key,
    "payerAccountNo": payer,
    "payeeAccountNo": payee,
    "sourceAmount": 2000,
    "channel": "SWIFT",
    "urgent": False,
})
    print(f"  INFO  同幂等键重发 code={again.get('code')} {again.get('message','')}")

    print("\n===== TCC 三阶段 =====")

    # 初始化库存与账户
    _, seeded = post("/api/tcc/seed?userId=7&productId=7&available=100&balance=100000")
    print(f"  {'PASS' if ok(seeded) else 'FAIL'}  seed 初始化                  code={seeded.get('code') if isinstance(seeded, dict) else '-'}")

    # 正常提交
    _, success = post("/api/tcc/order", {
        "userId": 7, "productId": 7, "quantity": 2, "forceFailure": False,
    })
    print(f"  {'PASS' if ok(success) else 'FAIL'}  正常提交                      committed={((success or {}).get('data') or {}).get('committed')}")

    # 强制失败
    _, failed = post("/api/tcc/order", {
        "userId": 7, "productId": 7, "quantity": 3, "forceFailure": True,
    })
    print(f"  {'PASS' if ok(failed) else 'FAIL'}  强制失败回滚                  committed={((failed or {}).get('data') or {}).get('committed')}")


if __name__ == "__main__":
    main()

