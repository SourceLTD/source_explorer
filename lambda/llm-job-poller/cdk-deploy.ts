#!/usr/bin/env node

/**
 * AWS CDK deployment script for LLM Job Poller
 * 
 * This is an alternative to the bash script that uses TypeScript and AWS CDK
 * for infrastructure as code with better type safety and modularity.
 * 
 * Setup:
 *   npm install -g aws-cdk
 *   npm install aws-cdk-lib constructs
 * 
 * Deploy:
 *   export DATABASE_URL="postgresql://..."
 *   export OPENAI_API_KEY="sk-..."
 *   cdk deploy
 * 
 * Destroy:
 *   cdk destroy
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

class LLMJobPollerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get environment variables
    const databaseUrl = process.env.DATABASE_URL;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!databaseUrl || !openaiApiKey) {
      throw new Error('DATABASE_URL and OPENAI_API_KEY must be set');
    }

    // Lambda function
    const pollerFunction = new lambda.Function(this, 'LLMJobPoller', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('.', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            'npm install && npm run build && cp -r dist node_modules /asset-output/'
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        DATABASE_URL: databaseUrl,
        OPENAI_API_KEY: openaiApiKey,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // EventBridge rule for scheduling
    const rule = new events.Rule(this, 'PollerSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.seconds(30)),
      description: 'Trigger LLM Job Poller every 30 seconds',
    });

    // Add Lambda as target
    rule.addTarget(new targets.LambdaFunction(pollerFunction));

    // Outputs
    new cdk.CfnOutput(this, 'FunctionName', {
      value: pollerFunction.functionName,
      description: 'Lambda function name',
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: pollerFunction.functionArn,
      description: 'Lambda function ARN',
    });

    new cdk.CfnOutput(this, 'LogGroup', {
      value: pollerFunction.logGroup.logGroupName,
      description: 'CloudWatch log group',
    });
  }
}

// CDK App
const app = new cdk.App();
new LLMJobPollerStack(app, 'LLMJobPollerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

