#!/bin/sh
# Deploys the hosted anahita-mcp to AWS, all of it in REGION: the
# certificate, the function, the HTTP API and the address, then the server's
# code. Run it again to deploy a new version. See docs/hosting.md.
#
# Every setting is named; nothing falls back to a default profile, so the
# script cannot reach an account it was not pointed at.
#
#   AWS_PROFILE=banu REGION=ca-central-1 DOMAIN=mcp.anahita.io \
#     HOSTED_ZONE_ID=Z037321833BHVLHEM21A0 deploy/deploy.sh
set -eu
: "${AWS_PROFILE:?name the AWS profile}"
: "${REGION:?name the region the function runs in}"
: "${DOMAIN:?name the address, such as mcp.anahita.io}"
: "${HOSTED_ZONE_ID:?name the Route 53 zone the address is in}"
SITE="${SITE:-https://www.anahita.io}"
NAME="${FUNCTION_NAME:-anahita-mcp}"
export AWS_PROFILE

cd "$(dirname "$0")/.."
echo "Account $(aws sts get-caller-identity --query Account --output text), $REGION, $DOMAIN"

npm ci
npm test
npm run bundle

aws cloudformation deploy --region "$REGION" --stack-name "$NAME" \
  --template-file deploy/aws.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides FunctionName="$NAME" DomainName="$DOMAIN" HostedZoneId="$HOSTED_ZONE_ID" \
    Site="$SITE"

aws lambda update-function-code --region "$REGION" --function-name "$NAME" \
  --zip-file fileb://build/lambda.zip --query 'LastUpdateStatus' --output text
aws lambda wait function-updated --region "$REGION" --function-name "$NAME"
echo "https://$DOMAIN/mcp"
