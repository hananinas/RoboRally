{ pkgs }:

let
  identitySchema = ../../infra/kratos/identity.schema.json;
in
(pkgs.formats.yaml { }).generate "robo-rally-kratos.yml" {
  version = "v26.2.0";

  serve = {
    public = {
      host = "127.0.0.1";
      port = 14433;
      cors.enabled = true;
    };
    admin = {
      host = "127.0.0.1";
      base_url = "http://127.0.0.1:4434/";
    };
  };

  selfservice = {
    methods = {
      password.enabled = true;
      code.enabled = true;
    };
    flows = {
      recovery = {
        enabled = true;
        use = "code";
      };
      verification = {
        enabled = true;
        use = "code";
      };
      settings = {
        privileged_session_max_age = "15m";
        required_aal = "highest_available";
      };
      login.lifespan = "10m";
      registration = {
        lifespan = "10m";
        after.password.hooks = [
          { hook = "session"; }
          { hook = "show_verification_ui"; }
        ];
      };
    };
  };

  log = {
    level = "info";
    format = "json";
  };

  hashers = {
    algorithm = "bcrypt";
    bcrypt.cost = 12;
  };

  ciphers.algorithm = "xchacha20-poly1305";

  identity = {
    default_schema_id = "default";
    schemas = [
      { id = "default"; url = "file://${identitySchema}"; }
    ];
  };
}
