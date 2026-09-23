#!/bin/bash
BUY=$(head -c6 /dev/urandom | md5sum | cut -c1-6)
echo "buyer_suffix=$BUY" > /tmp/i1_buyer.txt
EM="buyer_i1_${BUY}@demo.ru"
echo "email=$EM"
curl -s -X POST http://127.0.0.1:8001/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$EM\",\"password\":\"secret123\",\"role\":\"buyer\"}"
echo
