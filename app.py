import boto3
from botocore.exceptions import ClientError
from collections import defaultdict
from flask import Flask, request, send_file
from flask_cors import CORS
import json
import re
import sys
import yaml

app = Flask(__name__)
CORS(app)
app.config['CORS_HEADERS'] = 'Content-Type'

with open('./user_credentials.yaml', 'rt') as f:
    credentials = yaml.load(f.read())

try:
    s = boto3.session.Session(aws_access_key_id=credentials['admin']['access_key_id'],
                              aws_secret_access_key=credentials['admin']['secret_access_key'])
    sts = s.client('sts')
    account_id = sts.get_caller_identity()['Account']
except ClientError as error:
    print(error.response['Error']['Message'])
    sys.exit(0)


def compute_resource_paths(user, resource, prefixes):
    if isinstance(resource, list):
        if not prefixes:
            return [res.replace('${aws:username}', user).split(':')[-1] for res in resource]
        return [res.replace('${aws:username}', user).split(':')[-1] + '/' + prefix.replace('${aws:username}', user) for res in resource for prefix in prefixes]
    else:
        if not prefixes:
            return [resource.replace('${aws:username}', user).split(':')[-1]]
        return [resource.replace('${aws:username}', user).split(':')[-1]+ '/' + prefix.replace('${aws:username}', user) for prefix in prefixes]


def compute_attached_policies(user, raw_policies):
    attached_policies = defaultdict(dict)
    for policy in raw_policies:
        attached_policies[policy['PolicyName']] = defaultdict(list)
        for statement in policy['PolicyVersionList'][0]['Document']['Statement']:
            if isinstance(statement['Action'], list):
                for action in statement['Action']:
                    attached_policies[policy['PolicyName']][action].extend(compute_resource_paths(user, statement['Resource'], statement.get('Condition', {}).get('StringLike', {}).get('s3:prefix', None)))
            else:
                attached_policies[policy['PolicyName']][statement['Action']].extend(compute_resource_paths(user, statement['Resource'], statement.get('Condition', {}).get('StringLike', {}).get('s3:prefix', None)))

    return attached_policies

# Operatiunile cu S3 (listezi bucket-urile, upload-ezi, download-ezi, stergi fisiere)
@app.route('/s3/<username>/<class_no>/<path:key>', methods=['GET', 'POST', 'DELETE'])
def s3_ops(username, class_no, key):
    try:
        session = boto3.session.Session(aws_access_key_id=credentials[username.lower()]['access_key_id'],
                                        aws_secret_access_key=credentials[username.lower()]['secret_access_key'])
        client = session.client('s3')
    except KeyError:
        return "User not found", 404

    if request.method == 'GET':
        if 'STAR' in key:
            key = key.split('STAR')[0]
            try:
                response = client.list_objects(Bucket=class_no, Prefix=key)
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchKey':
                    return "File not found", 404
                return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']
            try:
                return {'files': list([content['Key'] for content in response['Contents'] if content['Key'] != key])}
            except KeyError:
                return {'files': []}
        else:
            try:
                response = client.get_object(Bucket=class_no, Key=key)
            except ClientError as e:
                if e.response['Error']['Code'] == 'NoSuchKey':
                    return "File not found", 404
                return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']

            return send_file(response['Body'], attachment_filename=key.split('/')[-1])

    elif request.method == 'POST':
        file_text = request.files['data'].read()
        try:
            client.put_object(Bucket=class_no, Key=key, Body=file_text)
        except ClientError:
            return "Access Denied", 403
        return "Successfully uploaded", 200

    else:
        try:
            client.delete_object(Bucket=class_no, Key=key)
        except ClientError as e:
            return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']
        return "Deleted", 200


# Adaugi sau scoti un user dintr-un grup
@app.route('/group/<username>/<user>/<group>', methods=['GET', 'DELETE'])
def iam_change_group(username, user, group):
    try:
        session = boto3.session.Session(aws_access_key_id=credentials[username.lower()]['access_key_id'],
                                        aws_secret_access_key=credentials[username.lower()]['secret_access_key'])
        client = session.client('iam')
    except KeyError:
        return "User not found", 404

    try:
        if request.method == 'GET':
            client.add_user_to_group(GroupName=group, UserName=user)
            return "User {} added to group {}.".format(user, group), 200
        else:
            client.remove_user_from_group(GroupName=group, UserName=user)
            return "User {} removed from group {}.".format(user, group), 200
    except ClientError as e:
        return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']


# Intorci drepturile pe care le are user-ul
@app.route('/user_info/<username>/<user>', methods=['GET'])
def iam_user_info(username, user):
    try:
        session = boto3.session.Session(aws_access_key_id=credentials[username.lower()]['access_key_id'],
                                        aws_secret_access_key=credentials[username.lower()]['secret_access_key'])
        client = session.client('iam')
    except KeyError:
        return "User not found", 404

    user_attached_policies = defaultdict(list)
    group_attached_policies = defaultdict(list)

    try:
        response = client.list_attached_user_policies(UserName=user)
        if response['AttachedPolicies']:
            for policy in response['AttachedPolicies']:
                response = client.get_policy(PolicyArn=policy['PolicyArn'])
                response = client.get_policy_version(PolicyArn=policy['PolicyArn'], VersionId=response['Policy']['DefaultVersionId'])
                for statement in response['PolicyVersion']['Document']['Statement']:
                    if isinstance(statement['Action'], list):
                        for action in statement['Action']:
                            user_attached_policies[action].extend(compute_resource_paths(user, statement['Resource'], statement.get('Condition', {}).get('StringLike', {}).get('s3:prefix', None)))
                    else:
                        user_attached_policies[statement['Action']].extend(compute_resource_paths(user, statement['Resource'], statement.get('Condition', {}).get('StringLike', {}).get('s3:prefix', None)))

        response = client.get_account_authorization_details(Filter=['LocalManagedPolicy'])
        all_groups_attached_policies = compute_attached_policies(user, response['Policies'])

        response = client.list_groups_for_user(UserName=user)
        for group in response['Groups']:
            response = client.list_attached_group_policies(GroupName=group['GroupName'])
            group_attached_policies = dict((action, list(set(group_attached_policies[action] + all_groups_attached_policies[policy['PolicyName']][action]))) for policy in response['AttachedPolicies'] for action in all_groups_attached_policies[policy['PolicyName']])

    except ClientError as e:
        return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']

    return json.dumps(dict(dict((action, list(set(user_attached_policies.get(action, []) + group_attached_policies.get(action, [])))) for action in set(list(user_attached_policies.keys()) + list(group_attached_policies.keys())))))


# Intorci cine poate folosi si cu ce drepturi un anumit path
@app.route('/path_info/<username>/<path:path>', methods=['GET'])
def iam_path_info(username, path):
    try:
        session = boto3.session.Session(aws_access_key_id=credentials[username.lower()]['access_key_id'],
                                        aws_secret_access_key=credentials[username.lower()]['secret_access_key'])
        client = session.client('iam')
    except KeyError:
        return "User not found", 404

    path_split = path.split('/')
    if len(path_split) >= 3 and path_split[2] != 'comun':
        user = path_split[2]
    else:
        user = '*'

    policies = defaultdict(dict)
    try:
        response = client.get_account_authorization_details(Filter=['LocalManagedPolicy'])
        all_groups_attached_policies = compute_attached_policies(user, response['Policies'])
        for group, actions in all_groups_attached_policies.items():
            policies[group] = list()
            for action, resources in actions.items():
                if not action.startswith('s3') or action == 's3:ListBucket' and path[-1] != '/':
                    continue
                for resource in resources:
                    if re.match(resource.replace('*', '.*'), path):
                        policies[group].append(action)
                        break
    except ClientError as e:
        return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']

    return json.dumps(dict((user if user != '*' and group.startswith('elevi') else group, actions) for group, actions in policies.items() if actions))


# Creezi sau stergi o politica (o creezi cu o singura operatiune, pe o singura resursa
@app.route('/policy/<username>/<name>/<method>/<path:path>', methods=['GET', 'DELETE'])
def manage_policy(username, name, method, path):
    try:
        session = boto3.session.Session(aws_access_key_id=credentials[username.lower()]['access_key_id'],
                                        aws_secret_access_key=credentials[username.lower()]['secret_access_key'])
        client = session.client('iam')
    except KeyError:
        return "User not found", 404

    if request.method == 'GET':
        policy_document = json.dumps(
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": "VisualEditor0",
                        "Effect": "Allow",
                        "Action": "s3:{}".format(method),
                        "Resource": "arn:aws:s3:::{}".format(path.replace('STAR', '*'))
                    }
                ]
            }
        )
        try:
            client.create_policy(PolicyName=name, PolicyDocument=policy_document)
        except ClientError as e:
            return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']
        return "Policy {} successfully created.".format(name)
    else:
        try:
            policy_arn = 'arn:aws:iam::{0}:policy/{1}'.format(account_id, name)
            client.delete_policy(PolicyArn=policy_arn)
        except ClientError as e:
            return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']
        return "Policy {} successfully deleted.".format(name)


# Intorci continutul unei politici, grupurile si user-ii atasati
@app.route('/get_policy/<username>/<name>/<version>', methods=['GET'])
def get_policy(username, name, version):
    try:
        session = boto3.session.Session(aws_access_key_id=credentials[username.lower()]['access_key_id'],
                                        aws_secret_access_key=credentials[username.lower()]['secret_access_key'])
        client = session.client('iam')
    except KeyError:
        return "User not found", 404

    content = defaultdict(list)
    policy_arn = 'arn:aws:iam::{0}:policy/{1}'.format(account_id, name)
    try:
        response = client.get_policy_version(PolicyArn=policy_arn, VersionId=version)
        for statement in response['PolicyVersion']['Document']['Statement']:
            if isinstance(statement['Action'], list):
                for action in statement['Action']:
                    content[action].extend(compute_resource_paths('<user>', statement['Resource'], statement.get('Condition', {}).get('StringLike', {}).get('s3:prefix', None)))
            else:
                content[statement['Action']].extend(compute_resource_paths('<user>', statement['Resource'], statement.get('Condition', {}).get('StringLike', {}).get('s3:prefix', None)))

        response = client.list_entities_for_policy(PolicyArn=policy_arn)
        groups_attached = list(group['GroupName'] for group in response['PolicyGroups'])
        users_attached = list(user['UserName'] for user in response['PolicyUsers'])

        return json.dumps({
            'content': content,
            'groups_attached': groups_attached,
            'users_attached': users_attached
        })
    except ClientError as e:
        return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']


# intorci toate politicile existente create de noi
@app.route('/policies/<username>', methods=['GET'])
def list_policies(username):
    try:
        session = boto3.session.Session(aws_access_key_id=credentials[username.lower()]['access_key_id'],
                                        aws_secret_access_key=credentials[username.lower()]['secret_access_key'])
        client = session.client('iam')
    except KeyError:
        return "User not found", 404

    try:
        response = client.list_policies(Scope='Local')
        return json.dumps(list(dict((key, policy[key]) for key in ('DefaultVersionId', 'PolicyName')) for policy in response['Policies']))
    except ClientError as e:
        return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']


# atasezi sau detasezi un user sau grup la sau de la o politica
@app.route('/policy_attachment/<username>/<policy_name>/<entity_name>/<entity_type>', methods=['GET', 'DELETE'])
def policy_attachment(username, policy_name, entity_name, entity_type):
    try:
        session = boto3.session.Session(aws_access_key_id=credentials[username.lower()]['access_key_id'],
                                        aws_secret_access_key=credentials[username.lower()]['secret_access_key'])
        client = session.client('iam')
    except KeyError:
        return "User not found", 404

    policy_arn = 'arn:aws:iam::{0}:policy/{1}'.format(account_id, policy_name)
    try:
        if request.method == 'GET':
            if entity_type == 'group':
                client.attach_group_policy(GroupName=entity_name, PolicyArn=policy_arn)
            else:
                client.attach_user_policy(UserName=entity_name, PolicyArn=policy_arn)
            return "Policy attached to {0} {1}".format(entity_type, entity_name)
        else:
            if entity_type == 'group':
                client.detach_group_policy(GroupName=entity_name, PolicyArn=policy_arn)
            else:
                client.detach_user_policy(UserName=entity_name, PolicyArn=policy_arn)
            return "Policy detached from {0} {1}".format(entity_type, entity_name)
    except ClientError as e:
        return e.response['Error']['Message'], e.response['ResponseMetadata']['HTTPStatusCode']


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000, use_reloader=False)