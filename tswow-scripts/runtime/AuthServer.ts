import { BuildType, findBuildType } from "../util/BuildType";
import { commands } from "../util/Commands";
import { patchTCConfig } from "../util/ConfigFile";
import { wfs } from "../util/FileSystem";
import { ipaths } from "../util/Paths";
import { Process } from "../util/Process";
import { term } from "../util/Terminal";
import { StartCommand, StopCommand } from "./CommandActions";
import { Dataset } from "./Dataset";
import { Connection, mysql } from "./MySQL";
import { NodeConfig } from "./NodeConfig";
import { Realm } from "./Realm";

export namespace AuthServer {
    const authserver = new Process('authserver')
    export let connection: Connection|undefined = undefined;

    function withTimeout<T>(label: string, promise: Promise<T>, ms = 15000): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            promise
                .then((value) => {
                    clearTimeout(timer);
                    resolve(value);
                })
                .catch((err) => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    export function query(sql: string) {
        if(!connection) {
            throw new Error('Internal error: Auth database connection not initialized');
        } else {
            return connection.query(sql);
        }
    }

    export function isStarted() {
        return authserver.isRunning();
    }

    export function stop() {
        term.debug('authserver', 'Stopping authserver')
        return authserver.stop();
    }

    export async function start(type: BuildType = NodeConfig.DefaultBuildType) {
        term.log('authserver', `Starting ${type} authserver`)
        authserver.setAutoRestart(NodeConfig.AutoRestartAuthServer)

        await withTimeout('authserver stop', Promise.resolve(stop()), 10000);
        if(authserver.isRunning()) {
            throw new Error(`Something else started the auth server while it was stopping`);
        }

        const authExe = wfs.absPath(ipaths.bin.core.pick('trinitycore').build.pick(type).authserver.get());
        if(!wfs.exists(authExe)) {
            throw new Error(`Authserver binary missing: ${authExe}`);
        }
        term.debug('authserver', `Using authserver binary: ${authExe}`)

        ipaths.bin.core.pick('trinitycore').build.pick(type).authserver_conf_dist
            .copy(ipaths.coredata.authserver.authserver_conf.get()+'.dist')

        ipaths.bin.core.pick('trinitycore').build.pick(type).authserver_conf_dist
            .copyOnNoTarget(ipaths.coredata.authserver.authserver_conf)

        term.debug('authserver', 'Setting up realmlist table for authserver')
        await withTimeout('authserver realmlist reset', query('DELETE FROM realmlist;'));
        await withTimeout('authserver realm insert', Promise.all(Realm.all().map(x=>query(x.realmlistSQL()))));
        await withTimeout('authserver build_info insert', Promise.all(Dataset.all().map(x=>query(x.gamebuildSQL()))));

        patchTCConfig(
              ipaths.coredata.authserver.authserver_conf.get()
            ,'LoginDatabaseInfo',NodeConfig.DatabaseString('auth')
        )

        authserver.startIn(ipaths.coredata.authserver.get(),
            authExe
                , [`-c${wfs.absPath(
                    ipaths.coredata.authserver.authserver_conf.get()
                )}`]
            );
    }

    export const command = commands.addCommand('authserver');

    export async function initializeDatabase() {
        term.debug('authserver', `Initializing authserver database`)
        if(NodeConfig.AutoStartAuthServer) {
            connection = new Connection(NodeConfig.DatabaseSettings('auth'),'auth');
            await connection.connect();
            await mysql.installAuth(connection);
        }
    }

    export async function initializeServer() {
        term.debug('misc', `Initializing authserver`)
        if(NodeConfig.AutoStartAuthServer) {
            await start(NodeConfig.DefaultBuildType);
        }
        StopCommand.addCommand(
             'authserver'
            , ''
            , 'Stops the local authserver'
            , async (args)=>{
                if(!authserver.isRunning()) {
                    throw new Error(`Authserver isn't running`)
                }
                await authserver.stop();
                term.success('authserver','authserver was stopped')
        }).addAlias('auth');

        StartCommand.addCommand(
             'authserver'
            ,'debug|release?'
            ,'Starts the local authserver'
            , (args)=>{
            return start(findBuildType(args));
        }).addAlias('auth');
    }
}