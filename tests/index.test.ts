import { createConnection, getConnection, Connection } from "typeorm"
import { JolocomSDK, NaivePasswordStore } from '@jolocom/sdk'
import { JolocomTypeormStorage } from '@jolocom/sdk-storage-typeorm'

const getSdk = async (connection: Connection) =>
  new JolocomSDK({
    passwordStore: new NaivePasswordStore(),
    storage: new JolocomTypeormStorage(connection)
  })

beforeEach(() => {
    return createConnection({
        type: "sqlite",
        database: ":memory:",
        dropSchema: true,
        entities: ['node_modules/@jolocom/sdk-storage-typeorm/js/src/entities/*.js'],
        synchronize: true,
        logging: false
    });
});

afterEach(() => {
    let conn = getConnection();
    return conn.close();
});

test("Create identity", async () => {
  const SDK = getSdk(getConnection())
  console.log(SDK)
});