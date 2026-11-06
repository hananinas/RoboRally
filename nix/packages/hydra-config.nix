{ pkgs }:

(pkgs.formats.yaml { }).generate "robo-rally-hydra.yml" {
  serve = {
    cookies.same_site_mode = "Lax";
    public = {
      host = "127.0.0.1";
      port = 14444;
    };
    admin.host = "127.0.0.1";
  };

  oidc.subject_identifiers.supported_types = [ "public" ];
}
